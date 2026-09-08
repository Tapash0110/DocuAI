"""Universal document text extractor supporting PDF, PPTX, DOCX, TXT, MD, and Images (OCR).

Preserves 1-indexed page numbering (or slide / section numbers) across all formats
to feed into the unified chunking and citation engine.
"""
import io
import logging
from pathlib import Path
import re
from typing import List, Optional, Tuple
from PIL import Image

from app.pdf_loader import load_pdf, get_ocr_engine

logger = logging.getLogger(__name__)


def load_pptx(file_bytes: bytes) -> List[Tuple[str, int]]:
    """Extract text from PowerPoint slides (.pptx). Each slide maps to a 1-indexed page."""
    import pptx

    prs = pptx.Presentation(io.BytesIO(file_bytes))
    pages: List[Tuple[str, int]] = []

    for idx, slide in enumerate(prs.slides, start=1):
        slide_parts: List[str] = []

        # Extract text from shapes (titles, text boxes, callouts)
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame:
                text = shape.text_frame.text.strip()
                if text:
                    slide_parts.append(text)
            elif shape.has_table and shape.table:
                # Extract table text
                for row in shape.table.rows:
                    row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_texts:
                        slide_parts.append(" | ".join(row_texts))

        # Check speaker notes
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                slide_parts.append(f"Notes: {notes}")

        combined = "\n\n".join(slide_parts).strip()
        if combined:
            pages.append((combined, idx))
        else:
            # If slide has no digital text, attempt OCR on embedded images
            ocr_texts: List[str] = []
            for shape in slide.shapes:
                if hasattr(shape, "image"):
                    try:
                        img_bytes = shape.image.blob
                        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                        ocr = get_ocr_engine()
                        res, _ = ocr(img)
                        if res:
                            lines = [item[1] for item in res if item and len(item) >= 2 and item[1]]
                            if lines:
                                ocr_texts.append("\n".join(lines))
                    except Exception as e:
                        logger.debug("Failed OCR on slide image: %s", e)
            if ocr_texts:
                pages.append(("\n".join(ocr_texts).strip(), idx))

    return pages


def load_docx(file_bytes: bytes) -> List[Tuple[str, int]]:
    """Extract text from Word documents (.docx) with paragraph and table preservation.

    Paginates long documents into logical ~450-word pages so citations have precise scope.
    """
    import docx

    doc = docx.Document(io.BytesIO(file_bytes))
    blocks: List[str] = []

    for para in doc.paragraphs:
        txt = para.text.strip()
        if not txt:
            continue
        # If heading style, format with markdown header
        if para.style.name.startswith("Heading"):
            blocks.append(f"### {txt}")
        else:
            blocks.append(txt)

    for table in doc.tables:
        for row in table.rows:
            row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_texts:
                blocks.append(" | ".join(row_texts))

    full_text = "\n\n".join(blocks).strip()
    if not full_text:
        return []

    return _paginate_text(full_text, words_per_page=450)


def load_text(file_bytes: bytes) -> List[Tuple[str, int]]:
    """Extract text from .txt, .md, .csv, .json, .log files with encoding fallback."""
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("latin-1")
        except Exception:
            text = file_bytes.decode("utf-8", errors="replace")

    text = text.strip()
    if not text:
        return []

    return _paginate_text(text, words_per_page=450)


def load_image(file_bytes: bytes) -> List[Tuple[str, int]]:
    """Extract text from an image (.png, .jpg, .jpeg, .webp, .bmp, .tiff) using RapidOCR."""
    try:
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    except Exception as e:
        logger.warning("Failed to open image: %s", e)
        return []

    ocr = get_ocr_engine()
    res, _ = ocr(img)
    if not res:
        return []

    lines = [
        item[1] for item in res
        if item and len(item) >= 2 and item[1] and item[1].strip()
    ]
    extracted = "\n".join(lines).strip()
    return [(extracted, 1)] if extracted else []


def load_raw_text(text: str) -> List[Tuple[str, int]]:
    """Paginate and format raw pasted text into chunkable pages."""
    text = (text or "").strip()
    if not text:
        return []
    return _paginate_text(text, words_per_page=450)


def _paginate_text(full_text: str, words_per_page: int = 450) -> List[Tuple[str, int]]:
    """Split a continuous text block into logical 1-indexed pages by paragraph boundaries."""
    paragraphs = full_text.split("\n\n")
    pages: List[Tuple[str, int]] = []
    curr_paras: List[str] = []
    curr_word_count = 0
    page_num = 1

    for p in paragraphs:
        p_clean = p.strip()
        if not p_clean:
            continue
        words = len(p_clean.split())
        if curr_word_count + words > words_per_page and curr_paras:
            pages.append(("\n\n".join(curr_paras), page_num))
            page_num += 1
            curr_paras = [p_clean]
            curr_word_count = words
        else:
            curr_paras.append(p_clean)
            curr_word_count += words

    if curr_paras:
        pages.append(("\n\n".join(curr_paras), page_num))

    return pages if pages else [(full_text, 1)]


def load_document(file_bytes: bytes, filename: str) -> List[Tuple[str, int]]:
    """Central entry point routing any uploaded file to its format-specific extractor.

    Supported formats:
    - PDF (.pdf): Native pypdf extraction with RapidOCR fallback
    - PowerPoint (.pptx): Slide-by-slide text & table extraction
    - Word (.docx): Structured paragraphs, headings, tables
    - Text / Markdown (.txt, .md, .markdown, .csv, .json, .log)
    - Images (.png, .jpg, .jpeg, .webp, .bmp, .tiff): OCR text extraction
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return load_pdf(file_bytes)
    elif ext in [".pptx", ".ppt"]:
        return load_pptx(file_bytes)
    elif ext in [".docx", ".doc"]:
        return load_docx(file_bytes)
    elif ext in [".txt", ".md", ".markdown", ".csv", ".json", ".log", ".rst"]:
        return load_text(file_bytes)
    elif ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]:
        return load_image(file_bytes)
    else:
        # Fallback: attempt text decoding first, then OCR
        try:
            return load_text(file_bytes)
        except Exception:
            return load_image(file_bytes)
