"""FAISS + BM25 hybrid store with per-session isolation and persistence.

Retrieval uses Reciprocal Rank Fusion (RRF) to combine dense (FAISS)
and sparse (BM25) search results.

Supports multiple documents per session, appending documents mid-chat,
and rehydrating sessions from SQLite embedding BLOBs upon server restart.
"""
import re
from dataclasses import dataclass
from typing import Dict, List, Optional
import faiss
import numpy as np
from rank_bm25 import BM25Okapi

from app.rag import Chunk, EMBED_DIM
from app import db

RRF_K = 60  # standard constant from Cormack et al.


def _tokenize(text: str) -> List[str]:
    """Lowercase and split on non-alphanumeric characters."""
    return re.findall(r"[a-z0-9]+", text.lower())


@dataclass
class Retrieval:
    chunk: Chunk
    score: float  # RRF score (higher = more relevant)


def resolve_query_doc_references(query: str, doc_names: List[str]) -> str:
    """Resolve ordinal references like 'first pdf', 'second pdf', 'pdf 1', 'pdf 2' into document names."""
    if not doc_names or len(doc_names) <= 1 or not query:
        return query

    expanded = query
    ordinals = [
        (0, r"\b(?:first|1st)\s+(?:pdf|document|doc|file|one|part|chapter)\b"),
        (1, r"\b(?:second|2nd)\s+(?:pdf|document|doc|file|one|part|chapter)\b"),
        (2, r"\b(?:third|3rd)\s+(?:pdf|document|doc|file|one|part|chapter)\b"),
        (3, r"\b(?:fourth|4th)\s+(?:pdf|document|doc|file|one|part|chapter)\b"),
        (0, r"\b(?:pdf|document|doc|file)\s+1\b"),
        (1, r"\b(?:pdf|document|doc|file)\s+2\b"),
        (2, r"\b(?:pdf|document|doc|file)\s+3\b"),
        (3, r"\b(?:pdf|document|doc|file)\s+4\b"),
        (0, r"\b(?:doc#|doc\s*#|pdf\s*#)\s*1\b"),
        (1, r"\b(?:doc#|doc\s*#|pdf\s*#)\s*2\b"),
        (2, r"\b(?:doc#|doc\s*#|pdf\s*#)\s*3\b"),
        (3, r"\b(?:doc#|doc\s*#|pdf\s*#)\s*4\b"),
    ]

    for idx, pattern in ordinals:
        if idx < len(doc_names) and doc_names[idx]:
            clean_name = re.sub(r"\.pdf$", "", doc_names[idx], flags=re.IGNORECASE).strip()
            if clean_name:
                expanded = re.sub(pattern, f"\\g<0> ({clean_name})", expanded, flags=re.IGNORECASE)

    return expanded


def is_cross_document_query(query: str, doc_names: Optional[List[str]] = None) -> bool:
    """Detect cross-document / relational / comparative / sequencing intent."""
    if not query:
        return False

    pattern = (
        r"\b("
        r"relat\w*|compar\w*|diff\w*|contrast\w*|versus|vs\.?|connect\w*|link\w*|"
        r"between|both|all|each|across|together|combin\w*|"
        r"first|second|third|fourth|1st|2nd|3rd|4th|"
        r"order|sequence|roadmap|prereq\w*|which.*(?:study|read|start|begin)|"
        r"(?:doc|pdf|file)\s*\d+"
        r")\b"
    )
    if re.search(pattern, query, re.IGNORECASE):
        return True

    if doc_names and len(doc_names) > 1:
        matched_docs = 0
        q_lower = query.lower()
        for name in doc_names:
            clean = re.sub(r"\.pdf$", "", name, flags=re.IGNORECASE)
            words = [
                w for w in re.findall(r"[a-z0-9]+", clean.lower())
                if len(w) >= 3 and w not in {"chap", "chapter", "part", "pdf", "the", "and", "doc", "document"}
            ]
            if words and any(w in q_lower for w in words):
                matched_docs += 1
        if matched_docs >= 2:
            return True

    return False


class VectorStore:
    """Hybrid FAISS + BM25 store for a collection of chunks."""

    def __init__(self) -> None:
        self.index: faiss.Index = faiss.IndexFlatIP(EMBED_DIM)
        self.chunks: List[Chunk] = []
        self.bm25: Optional[BM25Okapi] = None

    def reset(self) -> None:
        self.index = faiss.IndexFlatIP(EMBED_DIM)
        self.chunks = []
        self.bm25 = None

    def add(self, vectors: np.ndarray, chunks: List[Chunk]) -> None:
        if len(chunks) != vectors.shape[0]:
            raise ValueError("vectors and chunks length mismatch")
        self.index.add(vectors.astype("float32"))
        self.chunks.extend(chunks)
        # Rebuild BM25 index from all chunks in this session
        tokenized = [_tokenize(c.text) for c in self.chunks]
        self.bm25 = BM25Okapi(tokenized)

    def search(
        self, query_vector: np.ndarray, top_k: int = 3, query_text: str = ""
    ) -> List[Retrieval]:
        if self.index.ntotal == 0:
            return []

        # Extract all unique documents present in this store
        all_docs = list(dict.fromkeys(getattr(c, "doc_name", "") for c in self.chunks if getattr(c, "doc_name", "")))

        # Resolve ordinal references (e.g. 'second pdf' -> 'second pdf (Chap2 - OSI Architecture)')
        effective_query = resolve_query_doc_references(query_text, all_docs) if len(all_docs) > 1 else query_text

        # Detect cross-document / relational / comparative / sequencing intent
        is_cross_doc = len(all_docs) > 1 and is_cross_document_query(query_text, all_docs)

        # Fetch expanded candidates so RRF and CrossEncoder have ample context across all docs
        top_k_fetch = min(max(top_k * 8, 40), self.index.ntotal)

        # --- FAISS (dense) search ---
        q = query_vector.reshape(1, -1).astype("float32")
        _, faiss_indices = self.index.search(q, top_k_fetch)
        faiss_ranking = [int(idx) for idx in faiss_indices[0] if idx != -1]

        # --- BM25 (sparse) search with effective query text ---
        bm25_ranking: List[int] = []
        search_kw = effective_query or query_text
        bm25_scores = None
        if self.bm25 and search_kw:
            bm25_scores = self.bm25.get_scores(_tokenize(search_kw))
            bm25_ranking = np.argsort(bm25_scores)[::-1][:top_k_fetch].tolist()

        # --- Reciprocal Rank Fusion ---
        rrf_scores: Dict[int, float] = {}
        for rank, idx in enumerate(faiss_ranking):
            rrf_scores[idx] = rrf_scores.get(idx, 0) + 1 / (RRF_K + rank + 1)
        for rank, idx in enumerate(bm25_ranking):
            rrf_scores[idx] = rrf_scores.get(idx, 0) + 1 / (RRF_K + rank + 1)

        # Sort all by fused RRF score
        sorted_indices = sorted(rrf_scores, key=rrf_scores.get, reverse=True)

        selected_indices: List[int] = []
        seen = set()

        # Top overall candidates
        for idx in sorted_indices[:top_k]:
            if idx not in seen:
                selected_indices.append(idx)
                seen.add(idx)

        # Group by document to guarantee diverse multi-doc candidate pool
        doc_candidates: Dict[str, List[int]] = {}
        for idx in sorted_indices:
            doc = getattr(self.chunks[idx], "doc_name", "")
            doc_candidates.setdefault(doc, []).append(idx)

        for doc, idx_list in doc_candidates.items():
            for idx in idx_list[:3]:  # Top 3 from each document with matches
                if idx not in seen:
                    selected_indices.append(idx)
                    seen.add(idx)

        # In multi-document sessions, ensure EVERY active document has candidates in the pool for cross-doc questions
        if len(all_docs) > 1 and is_cross_doc:
            for doc in all_docs:
                existing_doc_count = sum(1 for idx in selected_indices if getattr(self.chunks[idx], "doc_name", "") == doc)
                needed = 3
                if existing_doc_count < needed:
                    doc_chunk_indices = [i for i, c in enumerate(self.chunks) if getattr(c, "doc_name", "") == doc]
                    if bm25_scores is not None and len(bm25_scores) > 0:
                        doc_chunk_scores = {i: bm25_scores[i] for i in doc_chunk_indices if i < len(bm25_scores)}
                        sorted_doc_chunks = sorted(doc_chunk_indices, key=lambda i: (doc_chunk_scores.get(i, 0), -(self.chunks[i].page)), reverse=True)
                    else:
                        sorted_doc_chunks = sorted(doc_chunk_indices, key=lambda i: self.chunks[i].page)

                    for idx in sorted_doc_chunks:
                        if existing_doc_count >= needed:
                            break
                        if idx not in seen:
                            selected_indices.append(idx)
                            seen.add(idx)
                            existing_doc_count += 1

        # Fill remaining up to fetch pool limit
        for idx in sorted_indices:
            if len(selected_indices) >= top_k_fetch:
                break
            if idx not in seen:
                selected_indices.append(idx)
                seen.add(idx)

        return [
            Retrieval(chunk=self.chunks[idx], score=round(rrf_scores.get(idx, 0.01), 4))
            for idx in selected_indices
        ]

    def size(self) -> int:
        return self.index.ntotal


class SessionStoreManager:
    """Manages VectorStore instances per session_id, with SQLite rehydration."""

    def __init__(self) -> None:
        self._stores: Dict[str, VectorStore] = {}
        self._active_session_id: Optional[str] = None

    def set_active_session(self, session_id: str) -> None:
        self._active_session_id = session_id

    def get_active_session(self) -> Optional[str]:
        if self._active_session_id:
            return self._active_session_id
        return db.get_latest_session_id()

    def get_store(self, session_id: Optional[str] = None) -> VectorStore:
        sid = session_id or self.get_active_session()
        if not sid:
            # Fallback default store
            sid = "default"

        if sid in self._stores:
            return self._stores[sid]

        # Try to rehydrate from SQLite
        store = VectorStore()
        saved_chunks = db.get_session_chunks(sid)
        if saved_chunks:
            vectors = np.array([c["embedding"] for c in saved_chunks], dtype=np.float32)
            chunk_objs = [
                Chunk(
                    chunk_id=c["chunk_id"],
                    text=c["text"],
                    page=c["page"],
                    doc_name=c["doc_name"],
                    doc_id=c["doc_id"],
                )
                for c in saved_chunks
            ]
            store.add(vectors, chunk_objs)

        self._stores[sid] = store
        return store

    def add(
        self,
        vectors: np.ndarray,
        chunks: List[Chunk],
        session_id: Optional[str] = None,
    ) -> None:
        sid = session_id or self.get_active_session() or "default"
        self._active_session_id = sid
        store = self.get_store(sid)
        store.add(vectors, chunks)

    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 3,
        query_text: str = "",
        session_id: Optional[str] = None,
    ) -> List[Retrieval]:
        sid = session_id or self.get_active_session()
        store = self.get_store(sid)
        return store.search(query_vector, top_k=top_k, query_text=query_text)

    def size(self, session_id: Optional[str] = None) -> int:
        sid = session_id or self.get_active_session()
        if not sid:
            return 0
        return self.get_store(sid).size()

    def reset(self, session_id: Optional[str] = None) -> None:
        sid = session_id or self.get_active_session()
        if sid and sid in self._stores:
            self._stores[sid].reset()

    def delete_session(self, session_id: str) -> None:
        if session_id in self._stores:
            del self._stores[session_id]
        if self._active_session_id == session_id:
            self._active_session_id = None

    def rehydrate_session(self, session_id: str) -> None:
        """Rebuild in-memory FAISS and BM25 store from SQLite chunks for a session."""
        new_store = VectorStore()
        saved_chunks = db.get_session_chunks(session_id)
        if saved_chunks:
            vectors = np.array([c["embedding"] for c in saved_chunks], dtype=np.float32)
            chunk_objs = [
                Chunk(
                    chunk_id=c["chunk_id"],
                    text=c["text"],
                    page=c["page"],
                    doc_name=c["doc_name"],
                    doc_id=c["doc_id"],
                )
                for c in saved_chunks
            ]
            new_store.add(vectors, chunk_objs)
        self._stores[session_id] = new_store


# Global singleton instance for backward compatibility and multi-session routing
store = SessionStoreManager()
