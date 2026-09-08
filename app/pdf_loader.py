"""PDF text extraction with hybrid digital extraction and OCR fallback.

Extracts native digital text via pypdf first for maximum speed.
If a page contains no digital text (e.g. scanned documents or image-only pages),
renders the page via pypdfium2 and extracts text using RapidOCR (ONNX Runtime).
Preserves 1-indexed page numbering for citations.
"""
import logging
import os
import tempfile
import uuid
from typing import List, Optional, Tuple

from pypdf import PdfReader
import pypdfium2

logger = logging.getLogger(__name__)

_ocr_engine = None


def get_ocr_engine():
    """Lazy-load RapidOCR singleton only when an image/scanned page is encountered."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            logger.info("Initialized RapidOCR engine for scanned PDF extraction.")
        except Exception as e:
            logger.error("Failed to initialize RapidOCR engine: %s", e)
            raise
    return _ocr_engine


def _ocr_page(pdf_doc: pypdfium2.PdfDocument, page_index: int) -> str:
    """Render a single page at 2x scale and run OCR."""
    try:
        page = pdf_doc[page_index]
        # scale=2.0 renders at 144 DPI which offers optimal OCR accuracy
        bmp = page.render(scale=2.0)
        pil_img = bmp.to_pil()
        ocr = get_ocr_engine()
        ocr_result, _ = ocr(pil_img)

        if not ocr_result:
            return ""

        extracted_lines = [
            item[1] for item in ocr_result
            if item and len(item) >= 2 and item[1] and item[1].strip()
        ]
        return "\n".join(extracted_lines).strip()
    except Exception as e:
        logger.warning("OCR failed on page %d: %s", page_index + 1, e)
        return ""


def load_pdf(file_bytes: bytes, tmp_path: Optional[str] = None) -> List[Tuple[str, int]]:
    """Extract text from a PDF, returning (text, page_number) per page.

    - Page numbers are 1-indexed for human readability.
    - If digital text is missing or sparse (< 20 characters), runs OCR automatically.
    - Fully supports scanned PDFs, receipts, offer letters, and image-only documents.
    """
    created_temp = False
    if tmp_path is None:
        tmp_path = os.path.join(
            tempfile.gettempdir(),
            f"_docuai_upload_{uuid.uuid4().hex[:12]}.pdf"
        )
        created_temp = True

    try:
        with open(tmp_path, "wb") as f:
            f.write(file_bytes)

        pages: List[Tuple[str, int]] = []
        pdfium_doc: Optional[pypdfium2.PdfDocument] = None

        # 1. Try standard digital text extraction with pypdf
        try:
            reader = PdfReader(tmp_path)
            total_pages = len(reader.pages)
        except Exception as e:
            logger.warning("pypdf failed to parse PDF: %s. Falling back to pypdfium2.", e)
            reader = None
            total_pages = 0

        # If pypdf could not open, open with pypdfium2 directly
        if reader is None:
            pdfium_doc = pypdfium2.PdfDocument(tmp_path)
            total_pages = len(pdfium_doc)

            for i in range(total_pages):
                page_text = _ocr_page(pdfium_doc, i)
                if page_text:
                    pages.append((page_text, i + 1))
            return pages

        # 2. Iterate each page, extracting digital text or falling back to OCR
        for i, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as e:
                logger.warning("pypdf error on page %d: %s", i, e)
                text = ""

            text = text.strip()

            # If digital text is empty or negligible (< 20 chars), trigger OCR
            if len(text) < 20:
                if pdfium_doc is None:
                    pdfium_doc = pypdfium2.PdfDocument(tmp_path)
                ocr_text = _ocr_page(pdfium_doc, i - 1)
                if ocr_text:
                    text = ocr_text

            if text:
                pages.append((text, i))

        if pdfium_doc is not None:
            try:
                pdfium_doc.close()
            except Exception:
                pass

        return pages

    finally:
        if created_temp and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception as e:
                logger.debug("Could not remove temp PDF %s: %s", tmp_path, e)

