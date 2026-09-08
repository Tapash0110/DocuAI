"""Sentence-aware chunking and dense vector embedding for DocuAI.

Chunking strategy:
- Respects paragraph and sentence boundaries (no slicing words in half).
- Target size 500 characters with 100-character sentence-level overlap.
- Preserves full document context and page provenance.

Embedding model: all-MiniLM-L6-v2 (384-dim, normalized for cosine inner-product).
"""
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer

TARGET_CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
EMBED_DIM = 384  # all-MiniLM-L6-v2 output dimension


@dataclass
class Chunk:
    chunk_id: int
    text: str
    page: int
    doc_name: str = ""
    doc_id: str = ""


_model: Optional[SentenceTransformer] = None


def get_embed_model() -> SentenceTransformer:
    """Lazy-load the embedding model. First call downloads ~80MB."""
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBED_MODEL_NAME)
    return _model


def _clean_and_normalize_text(text: str) -> str:
    """Clean OCR, slide, and digital PDF extraction artifacts.

    - Replaces Wingdings/Symbol and Private Use Area bullet icons (\uf071, \uf0d8, \uf0fc) with clean bullets
    - Strips replacement character (\ufffd) and unprintable control characters
    - Reconnects hyphenated line-breaks (e.g. 'docu-\\nment' -> 'document')
    - Fixes missing spaces after colons/commas when immediately followed by alphanumeric characters
    - Separates numbers joined with common units (e.g. '180seconds' -> '180 seconds')
    - Deduplicates consecutive duplicate lines caused by layered presentation slide shapes
    - Replaces non-breaking and irregular spaces with standard space
    - Normalizes multiple newlines while preserving paragraph and bullet structure
    """
    if not text:
        return ""

    # Rejoin hyphenated words split across lines
    cleaned = re.sub(r"(\b[a-zA-Z]{2,})-\n\s*([a-zA-Z]{2,}\b)", r"\1\2", text)

    # Convert Private Use Area symbols (Wingdings/Symbol bullets e.g. \uf071, \uf0d8, \uf0fc) to bullet points
    cleaned = re.sub(r"[\ue000-\uf8ff]+", "\n• ", cleaned)

    # Strip unicode replacement character and non-printable control characters
    cleaned = re.sub(r"[\ufffd\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\ufeff]", "", cleaned)

    # Replace non-breaking spaces or tabs with regular spaces
    cleaned = cleaned.replace("\xa0", " ").replace("\t", " ")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")

    # Fix space after punctuation if immediately followed by an alphanumeric character
    cleaned = re.sub(r"([,:;])([A-Za-z0-9])", r"\1 \2", cleaned)

    # Fix numbers joined directly with unit names (e.g. 180seconds -> 180 seconds)
    cleaned = re.sub(
        r"(\d+)(sec|seconds|min|minutes|hr|hours|ms|bps|kbps|mbps|gbps|bytes|kb|mb|gb)\b",
        r"\1 \2",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Ensure bullets start on their own line
    cleaned = re.sub(r"([^\n])\s*•\s*", r"\1\n• ", cleaned)

    # Normalize multiple spaces per line
    cleaned = re.sub(r"[ ]{2,}", " ", cleaned)

    # Deduplicate consecutive identical lines (frequent in presentation slides)
    raw_lines = cleaned.split("\n")
    clean_lines = []
    for line in raw_lines:
        s_line = line.strip()
        if not s_line:
            continue
        if clean_lines and clean_lines[-1] == s_line:
            continue
        clean_lines.append(s_line)

    cleaned = "\n".join(clean_lines)

    # Collapse 3+ newlines to 2
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _split_into_sentences(text: str) -> List[str]:
    """Split text into coherent sentence and list units while preserving context."""
    paragraphs = re.split(r"\n\s*\n", text)
    sentences: List[str] = []

    # Common abbreviations that should NOT cause sentence breaks
    abbrev_pattern = r"(?<!\bMr)(?<!\bMrs)(?<!\bDr)(?<!\bProf)(?<!\bSr)(?<!\bJr)(?<!\bvs)(?<!\be\.g)(?<!\bi\.e)(?<!\bNo)(?<!\bRs)(?<!\bapprox)(?<!\bInc)(?<!\bLtd)(?<!\bDept)(?<!\bUniv)"

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        lines = [line.strip() for line in para.split("\n") if line.strip()]
        curr_block: List[str] = []

        for line in lines:
            # If line is a bullet or numbered list item, treat as a distinct item
            is_list_item = bool(re.match(r"^([•\-\*]|\d+[\.\)]|\([a-zA-Z0-9]+\))\s+", line))
            if is_list_item and curr_block:
                block_text = " ".join(curr_block)
                # Split block text into sentences with abbreviation guard
                raw_sents = re.split(rf"{abbrev_pattern}(?<=[.?!])\s+", block_text)
                for s in raw_sents:
                    s_clean = s.strip()
                    if s_clean:
                        sentences.append(s_clean)
                curr_block = [line]
            else:
                curr_block.append(line)

        if curr_block:
            block_text = " ".join(curr_block)
            raw_sents = re.split(rf"{abbrev_pattern}(?<=[.?!])\s+", block_text)
            for s in raw_sents:
                s_clean = s.strip()
                if s_clean:
                    sentences.append(s_clean)

    return sentences


def chunk_pages(
    pages: List[Tuple[str, int]],
    doc_name: str = "",
    doc_id: str = "",
    start_chunk_id: int = 0,
) -> List[Chunk]:
    """Split each page's text into coherent sentence-bounded chunks with overlap."""
    chunks: List[Chunk] = []
    chunk_id = start_chunk_id

    for raw_text, page_num in pages:
        normalized_text = _clean_and_normalize_text(raw_text)
        if not normalized_text:
            continue

        sentences = _split_into_sentences(normalized_text)
        if not sentences:
            sentences = [p.strip() for p in normalized_text.split("\n") if p.strip()]

        if not sentences:
            continue

        current_chunk: List[str] = []
        current_len = 0

        i = 0
        while i < len(sentences):
            sent = sentences[i]
            sent_len = len(sent)

            # If a single sentence or clause is longer than target size, split cleanly on words
            if sent_len > TARGET_CHUNK_SIZE:
                if current_chunk:
                    chunk_text = " ".join(current_chunk).strip()
                    if chunk_text:
                        chunks.append(
                            Chunk(
                                chunk_id=chunk_id,
                                text=chunk_text,
                                page=page_num,
                                doc_name=doc_name,
                                doc_id=doc_id,
                            )
                        )
                        chunk_id += 1
                    current_chunk = []
                    current_len = 0

                words = sent.split()
                w_chunk: List[str] = []
                w_len = 0
                for w in words:
                    w_chunk.append(w)
                    w_len += len(w) + 1
                    if w_len >= TARGET_CHUNK_SIZE:
                        chunks.append(
                            Chunk(
                                chunk_id=chunk_id,
                                text=" ".join(w_chunk),
                                page=page_num,
                                doc_name=doc_name,
                                doc_id=doc_id,
                            )
                        )
                        chunk_id += 1
                        w_chunk = []
                        w_len = 0
                if w_chunk:
                    chunks.append(
                        Chunk(
                            chunk_id=chunk_id,
                            text=" ".join(w_chunk),
                            page=page_num,
                            doc_name=doc_name,
                            doc_id=doc_id,
                        )
                    )
                    chunk_id += 1
                i += 1
                continue

            # When adding sent would exceed TARGET_CHUNK_SIZE, finalize chunk and calculate overlap
            if current_len + sent_len > TARGET_CHUNK_SIZE and current_chunk:
                chunk_text = " ".join(current_chunk).strip()
                if chunk_text:
                    chunks.append(
                        Chunk(
                            chunk_id=chunk_id,
                            text=chunk_text,
                            page=page_num,
                            doc_name=doc_name,
                            doc_id=doc_id,
                        )
                    )
                    chunk_id += 1

                # Form overlap from trailing sentences
                overlap_chunk: List[str] = []
                overlap_len = 0
                for s in reversed(current_chunk):
                    if overlap_len + len(s) <= CHUNK_OVERLAP or not overlap_chunk:
                        overlap_chunk.insert(0, s)
                        overlap_len += len(s) + 1
                    else:
                        break

                current_chunk = overlap_chunk
                current_len = overlap_len

            current_chunk.append(sent)
            current_len += sent_len + 1
            i += 1

        if current_chunk:
            chunk_text = " ".join(current_chunk).strip()
            if chunk_text:
                chunks.append(
                    Chunk(
                        chunk_id=chunk_id,
                        text=chunk_text,
                        page=page_num,
                        doc_name=doc_name,
                        doc_id=doc_id,
                    )
                )
                chunk_id += 1

    return chunks


def embed_texts(texts: List[str]) -> np.ndarray:
    """Embed a list of strings. Returns (N, EMBED_DIM) float32 array."""
    model = get_embed_model()
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return vectors.astype("float32")
