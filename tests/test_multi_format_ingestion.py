"""Automated tests for universal multi-format document ingestion:
PowerPoint (.pptx), Word (.docx), Markdown (.md), Images with OCR (.png),
and pasted raw text via /upload/text.
"""
import io
import pytest
from fastapi.testclient import TestClient
import docx
import pptx
from PIL import Image, ImageDraw

from app.main import app
from tests.conftest import SAMPLE_PDF


def _make_sample_docx() -> bytes:
    """Create a sample DOCX in memory with specific facts."""
    doc = docx.Document()
    doc.add_heading("Zentara Cloud Services", level=1)
    doc.add_paragraph("Zentara Cloud Hub provides real-time fleet analytics and automated dispatching.")
    doc.add_heading("Pricing and Tiers", level=2)
    doc.add_paragraph("The Cloud Hub Enterprise tier costs $1,200 per month per facility.")
    table = doc.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Tier"
    table.rows[0].cells[1].text = "API Limit"
    table.rows[1].cells[0].text = "Enterprise"
    table.rows[1].cells[1].text = "1,000,000 req/mo"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_sample_pptx() -> bytes:
    """Create a sample PPTX presentation in memory."""
    prs = pptx.Presentation()
    # Slide 1: Title
    slide1 = prs.slides.add_slide(prs.slide_layouts[0])
    slide1.shapes.title.text = "Zentara Autonomous Fleet Overview"
    slide1.placeholders[1].text = "Next-Generation Robotics for Automated Warehouses"

    # Slide 2: Specs
    slide2 = prs.slides.add_slide(prs.slide_layouts[1])
    slide2.shapes.title.text = "Magpie-7 Technical Specifications"
    slide2.placeholders[1].text = "Battery run time is 14 continuous operating hours with rapid magnetic inductive docking."
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _make_sample_image_with_text() -> bytes:
    """Create a sample PNG image with rendered text for OCR validation."""
    img = Image.new("RGB", (450, 150), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((20, 30), "Zentara Warranty Certificate", fill=(0, 0, 0))
    d.text((20, 70), "Registration Serial: ZNT-8849-XK", fill=(0, 0, 0))
    d.text((20, 100), "Coverage Period: 36 Months Comprehensive", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_docx_ingestion_and_query():
    """Verify Word document (.docx) upload, chunking, and querying."""
    docx_bytes = _make_sample_docx()

    with TestClient(app) as client:
        sess = client.post("/sessions", json={"title": "DOCX Test"}).json()
        sid = sess["id"]

        upload_resp = client.post(
            "/upload",
            files={"file": ("cloud_services.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            data={"session_id": sid},
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        assert data["filename"] == "cloud_services.docx"
        assert data["chunks_indexed"] > 0
        assert data["doc_id"]

        q_resp = client.post(
            "/query",
            json={
                "question": "How much does the Cloud Hub Enterprise tier cost per month?",
                "session_id": sid,
            },
        )
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert "$1,200" in q_data["answer"] or "1,200" in q_data["answer"] or "1200" in q_data["answer"]
        assert any("cloud_services.docx" in s["doc_name"] for s in q_data["sources"])

        client.delete(f"/sessions/{sid}")


def test_pptx_ingestion_and_query():
    """Verify PowerPoint presentation (.pptx) upload, slide indexing, and querying."""
    pptx_bytes = _make_sample_pptx()

    with TestClient(app) as client:
        sess = client.post("/sessions", json={"title": "PPTX Test"}).json()
        sid = sess["id"]

        upload_resp = client.post(
            "/upload",
            files={"file": ("fleet_overview.pptx", pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            data={"session_id": sid},
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        assert data["filename"] == "fleet_overview.pptx"
        assert data["pages_processed"] == 2  # 2 slides = 2 pages

        q_resp = client.post(
            "/query",
            json={
                "question": "What is the continuous operating battery run time of the Magpie-7?",
                "session_id": sid,
            },
        )
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert "14" in q_data["answer"]
        assert any("fleet_overview.pptx" in s["doc_name"] for s in q_data["sources"])

        client.delete(f"/sessions/{sid}")


def test_image_ocr_ingestion_and_preview():
    """Verify Image (.png) upload with OCR extraction and visual page image serving."""
    img_bytes = _make_sample_image_with_text()

    with TestClient(app) as client:
        sess = client.post("/sessions", json={"title": "Image OCR Test"}).json()
        sid = sess["id"]

        upload_resp = client.post(
            "/upload",
            files={"file": ("warranty_cert.png", img_bytes, "image/png")},
            data={"session_id": sid},
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        assert data["filename"] == "warranty_cert.png"
        doc_id = data["doc_id"]

        # Verify page preview returns image bytes
        page_resp = client.get(f"/documents/{doc_id}/page/1")
        assert page_resp.status_code == 200
        assert page_resp.headers["content-type"] == "image/png"
        assert len(page_resp.content) > 100

        # Query extracted serial / warranty info
        q_resp = client.post(
            "/query",
            json={
                "question": "What is the registration serial number on the warranty certificate?",
                "session_id": sid,
            },
        )
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert "ZNT" in q_data["answer"] or "8849" in q_data["answer"]

        client.delete(f"/sessions/{sid}")


def test_pasted_raw_text_upload_and_query():
    """Verify POST /upload/text allows pasting arbitrary text notes into a session."""
    pasted_text = (
        "Project Orion Architecture Notes\n\n"
        "The message broker runs Apache Kafka with 12 partitions per topic.\n"
        "Retention policy is configured to 7 days for audit events and 24 hours for telemetry."
    )

    with TestClient(app) as client:
        sess = client.post("/sessions", json={"title": "Notes Test"}).json()
        sid = sess["id"]

        upload_resp = client.post(
            "/upload/text",
            json={
                "title": "Orion Architecture Notes",
                "text": pasted_text,
                "session_id": sid,
            },
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        assert data["filename"] == "Orion Architecture Notes.txt"
        assert data["chunks_indexed"] > 0

        q_resp = client.post(
            "/query",
            json={
                "question": "How many partitions per topic does Apache Kafka use in Project Orion?",
                "session_id": sid,
            },
        )
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert "12" in q_data["answer"]
        assert any("Orion Architecture Notes" in s["doc_name"] for s in q_data["sources"])

        client.delete(f"/sessions/{sid}")


def test_cross_format_pdf_and_pptx_session():
    """Verify cross-format session containing both a PDF and a PPTX presentation."""
    pptx_bytes = _make_sample_pptx()

    with TestClient(app) as client:
        sess = client.post("/sessions", json={"title": "Cross-Format Session"}).json()
        sid = sess["id"]

        # 1. Upload PDF
        with open(SAMPLE_PDF, "rb") as f:
            r1 = client.post(
                "/upload",
                files={"file": ("zentara_guide.pdf", f, "application/pdf")},
                data={"session_id": sid},
            )
        assert r1.status_code == 200

        # 2. Upload PPTX
        r2 = client.post(
            "/upload",
            files={"file": ("fleet_overview.pptx", pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            data={"session_id": sid},
        )
        assert r2.status_code == 200
        assert r2.json()["total_session_docs"] == 2

        # 3. Query across both
        q_resp = client.post(
            "/query",
            json={
                "question": "Summarize what is covered in the PDF guide compared to the PowerPoint presentation.",
                "top_k": 4,
                "session_id": sid,
            },
        )
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert q_data["answer"] != "I couldn't find that in the document."

        cited_docs = {s["doc_name"] for s in q_data["sources"]}
        assert "zentara_guide.pdf" in cited_docs or "fleet_overview.pptx" in cited_docs

        client.delete(f"/sessions/{sid}")
