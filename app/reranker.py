"""Cross-encoder reranker for second-stage retrieval.

Evaluates joint (query, passage) semantics with the CrossEncoder for high precision.
Uses sigmoid calibrated probabilities and balances multi-document context so questions
spanning multiple PDFs (e.g. 2nd and 3rd PDF) have their most relevant chunks preserved.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (~80MB, CPU-friendly).
"""
import re
from typing import Dict, List, Optional
import numpy as np
from sentence_transformers import CrossEncoder

from app.store import Retrieval, is_cross_document_query, resolve_query_doc_references

RERANKER_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

_reranker: Optional[CrossEncoder] = None


def get_reranker() -> CrossEncoder:
    """Lazy-load the cross-encoder. First call downloads ~80MB."""
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoder(RERANKER_MODEL_NAME)
    return _reranker


def rerank(query: str, retrievals: List[Retrieval], top_k: int) -> List[Retrieval]:
    """Cross-encoder reranking across candidate chunks.

    - Resolves ordinal references (e.g. 'second pdf' -> 'second pdf (Chap2 - OSI Architecture)')
      so CrossEncoder scores them against the proper document context.
    - Applies sigmoid normalization to produce 0.0 - 1.0 confidence scores.
    - For cross-document queries, guarantees balanced multi-document context so questions
      spanning multiple PDFs have representation from all relevant active documents.
    - For single-document or specific queries, returns the highest scoring chunks undisturbed.
    """
    if not retrievals:
        return []

    # Extract unique document names from candidate retrievals
    doc_names = list(dict.fromkeys(getattr(r.chunk, "doc_name", "") for r in retrievals if getattr(r.chunk, "doc_name", "")))

    # Resolve ordinal references if multiple documents are present
    effective_query = resolve_query_doc_references(query, doc_names) if len(doc_names) > 1 else query

    model = get_reranker()

    # Form (query, passage) pairs with document title context using effective_query
    pairs = []
    for r in retrievals:
        doc = getattr(r.chunk, "doc_name", "")
        passage = f"[Document: {doc}]\n{r.chunk.text}" if doc else r.chunk.text
        pairs.append([effective_query, passage])

    raw_scores = model.predict(pairs)

    # Convert logits to probability via sigmoid: 1 / (1 + exp(-x))
    clipped = np.clip(raw_scores, -20.0, 20.0)
    scores = 1.0 / (1.0 + np.exp(-clipped))

    for r, score in zip(retrievals, scores):
        r.score = round(float(score), 4)

    # Sort all by cross-encoder score descending
    retrievals.sort(key=lambda r: r.score, reverse=True)

    # Group candidate chunks by document
    doc_groups: Dict[str, List[Retrieval]] = {}
    for r in retrievals:
        d = getattr(r.chunk, "doc_name", "default")
        doc_groups.setdefault(d, []).append(r)

    # Check if this query is a cross-document / comparison / overview / sequencing query
    is_cross_doc = len(doc_groups) > 1 and is_cross_document_query(query, doc_names)

    if is_cross_doc:
        balanced: List[Retrieval] = []
        seen_ids = set()

        # Step 1: Guarantee the highest-scoring chunk from each active document
        for d, r_list in doc_groups.items():
            best = r_list[0]
            balanced.append(best)
            seen_ids.add(best.chunk.chunk_id)

        # Step 2: For cross-doc/comparison questions, also allocate second slot to each doc if capacity allows
        if top_k >= len(doc_groups) * 2:
            for d, r_list in doc_groups.items():
                if len(r_list) > 1 and r_list[1].chunk.chunk_id not in seen_ids:
                    balanced.append(r_list[1])
                    seen_ids.add(r_list[1].chunk.chunk_id)

        # Step 3: Fill remaining top_k slots with highest overall scorers
        for r in retrievals:
            if len(balanced) >= top_k:
                break
            if r.chunk.chunk_id not in seen_ids:
                balanced.append(r)
                seen_ids.add(r.chunk.chunk_id)

        # Sort selected set by final score descending
        balanced.sort(key=lambda r: r.score, reverse=True)
        return balanced[:max(top_k, len(doc_groups))]

    # Single-document or specific query: standard top_k by highest score
    return retrievals[:top_k]
