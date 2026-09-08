"""Tests for OCR scanned PDF extraction and optimized semantic chunking."""
import io
import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from app.main import app
from app.pdf_loader import load_pdf
from app.rag import chunk_pages, _clean_and_normalize_text, TARGET_CHUNK_SIZE, CHUNK_OVERLAP


def create_scanned_pdf(text: str = "TCS Offer Letter\nCandidate Name: John Doe\nDesignation: Systems Engineer\nCTC: 700000 INR per annum") -> bytes:
    """Create a synthetic scanned (pure bitmap image) PDF without digital text streams."""
    img = Image.new("RGB", (800, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((40, 50), text, fill=(0, 0, 0))

    pdf_buffer = io.BytesIO()
    img.save(pdf_buffer, format="PDF", resolution=150.0)
    return pdf_buffer.getvalue()


def test_ocr_extraction_on_scanned_pdf():
    """Verify that pure bitmap/scanned PDFs are read via RapidOCR with page numbers."""
    pdf_bytes = create_scanned_pdf("Confidential Agreement\nProject: DocuAI Core RAG\nStatus: Approved")
    pages = load_pdf(pdf_bytes)

    assert len(pages) >= 1
    page_text, page_num = pages[0]
    assert page_num == 1
    # Check that OCR recognized keywords from the image
    lower_text = page_text.lower()
    assert "confidential" in lower_text or "docuai" in lower_text or "approved" in lower_text


def test_upload_endpoint_with_scanned_pdf():
    """Verify that uploading a scanned PDF to /upload succeeds and indexes chunks."""
    scanned_bytes = create_scanned_pdf("Quarterly Performance Review\nTarget Met: 98%\nBonus: Eligible")

    with TestClient(app) as client:
        resp = client.post(
            "/upload",
            files={"file": ("scanned_invoice.pdf", scanned_bytes, "application/pdf")},
        )
        assert resp.status_code == 200, f"Upload error: {resp.text}"
        data = resp.json()
        assert data["chunks_indexed"] > 0
        assert data["filename"] == "scanned_invoice.pdf"

        # Clean up test session immediately so test records do not appear in the user's chat history
        session_id = data.get("session_id")
        if session_id:
            client.delete(f"/sessions/{session_id}")


def test_clean_and_normalize_text():
    """Verify de-hyphenation across linebreaks and whitespace normalization."""
    raw = "The imple-\nmentation of the archi-\ntecture is robust.\n\n\n\nNew section starts here."
    cleaned = _clean_and_normalize_text(raw)
    assert "implementation" in cleaned
    assert "architecture" in cleaned
    assert "\n\n\n\n" not in cleaned
    assert "New section starts here." in cleaned


def test_chunking_size_and_overlap():
    """Verify sentence-aware chunking produces coherent chunks respecting overlap."""
    sentences = [f"Clause {i}: This is a detailed policy paragraph explaining rule number {i} for all employees." for i in range(25)]
    text = " ".join(sentences)
    pages = [(text, 1)]

    chunks = chunk_pages(pages, doc_name="policy.pdf", doc_id="test-doc-1")
    assert len(chunks) > 1

    for c in chunks:
        assert c.doc_name == "policy.pdf"
        assert c.page == 1
        assert len(c.text) <= TARGET_CHUNK_SIZE * 1.5  # Reasonable threshold

    # Check that overlap exists between chunk 0 and chunk 1
    # Words near end of chunk 0 should appear near start of chunk 1
    words_c0 = set(chunks[0].text.split()[-10:])
    words_c1 = set(chunks[1].text.split()[:20])
    overlap_words = words_c0.intersection(words_c1)
    assert len(overlap_words) > 0, "Expected overlap between consecutive chunks"
