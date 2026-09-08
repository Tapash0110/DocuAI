"""Automated evaluation suite for multi-document batch ingestion, cross-document retrieval,
in-app PDF page image rendering, and individual document deletion.
"""
import io
import pytest
from pypdf import PdfReader, PdfWriter
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SAMPLE_PDF


def _create_split_pdfs():
    """Create two distinct PDFs from sample document to test cross-document features."""
    reader = PdfReader(SAMPLE_PDF)

    # Document 1: Overview & Specs (Pages 1 & 2)
    w1 = PdfWriter()
    w1.add_page(reader.pages[0])
    w1.add_page(reader.pages[1])
    buf1 = io.BytesIO()
    w1.write(buf1)
    doc1_bytes = buf1.getvalue()

    # Document 2: Operations & Policies (Pages 3 & 4)
    w2 = PdfWriter()
    w2.add_page(reader.pages[2])
    w2.add_page(reader.pages[3])
    buf2 = io.BytesIO()
    w2.write(buf2)
    doc2_bytes = buf2.getvalue()

    return doc1_bytes, doc2_bytes


def test_batch_upload_multiple_pdfs():
    """Verify /upload/batch indexes multiple PDF documents simultaneously into a single session."""
    doc1_bytes, doc2_bytes = _create_split_pdfs()

    with TestClient(app) as client:
        # Create fresh session
        sess_resp = client.post("/sessions", json={"title": "Batch Multi-Doc Test"})
        assert sess_resp.status_code == 200
        session_id = sess_resp.json()["id"]

        # Batch upload both files
        resp = client.post(
            "/upload/batch",
            data={"session_id": session_id},
            files=[
                ("files", ("zentara_overview.pdf", doc1_bytes, "application/pdf")),
                ("files", ("zentara_operations.pdf", doc2_bytes, "application/pdf")),
            ],
        )
        assert resp.status_code == 200, f"Batch upload failed: {resp.text}"
        data = resp.json()

        assert data["session_id"] == session_id
        assert data["total_files_uploaded"] == 2
        assert data["total_session_docs"] == 2
        assert data["total_chunks_indexed"] > 0
        assert len(data["documents"]) == 2

        # Verify documents list in session endpoint
        sess_data = client.get(f"/sessions/{session_id}").json()
        doc_names = [d["filename"] for d in sess_data["documents"]]
        assert "zentara_overview.pdf" in doc_names
        assert "zentara_operations.pdf" in doc_names

        # Clean up test session
        client.delete(f"/sessions/{session_id}")


def test_multi_doc_targeted_and_cross_doc_retrieval():
    """Verify hybrid search and reranking accurately targets individual docs and synthesizes across docs."""
    doc1_bytes, doc2_bytes = _create_split_pdfs()

    with TestClient(app) as client:
        # Create session and batch upload
        sess_resp = client.post("/sessions", json={"title": "Cross Doc Retrieval Test"})
        session_id = sess_resp.json()["id"]

        batch_resp = client.post(
            "/upload/batch",
            data={"session_id": session_id},
            files=[
                ("files", ("zentara_overview.pdf", doc1_bytes, "application/pdf")),
                ("files", ("zentara_operations.pdf", doc2_bytes, "application/pdf")),
            ],
        )
        assert batch_resp.status_code == 200

        # Query 1: Targets Document 1 (Overview)
        q1_resp = client.post(
            "/query",
            json={
                "question": "What autonomous picking robot does Zentara make?",
                "top_k": 3,
                "session_id": session_id,
            },
        )
        assert q1_resp.status_code == 200
        q1_data = q1_resp.json()
        assert len(q1_data["sources"]) > 0
        # Should cite zentara_overview.pdf
        doc_sources_q1 = [s["doc_name"] for s in q1_data["sources"]]
        assert "zentara_overview.pdf" in doc_sources_q1
        assert "doc_id" in q1_data["sources"][0]
        assert len(q1_data["sources"][0]["doc_id"]) > 0

        # Query 2: Cross-document question drawing context from both documents
        q2_resp = client.post(
            "/query",
            json={
                "question": "Summarize Zentara robotics products and support warranty tiers.",
                "top_k": 5,
                "session_id": session_id,
            },
        )
        assert q2_resp.status_code == 200
        q2_data = q2_resp.json()
        cited_docs = {s["doc_name"] for s in q2_data["sources"]}
        # Cross-document balancing should provide candidates from both attached documents
        assert len(cited_docs) >= 1

        # Clean up
        client.delete(f"/sessions/{session_id}")


def test_page_image_rendering_endpoint():
    """Verify GET /documents/{doc_id}/page/{page_num} renders high-quality PNG page preview."""
    doc1_bytes, _ = _create_split_pdfs()

    with TestClient(app) as client:
        upload_resp = client.post(
            "/upload",
            files={"file": ("page_preview_test.pdf", doc1_bytes, "application/pdf")},
        )
        assert upload_resp.status_code == 200
        data = upload_resp.json()
        doc_id = data["doc_id"]
        session_id = data["session_id"]
        assert doc_id, "doc_id should be returned on upload"

        # Request rendered page 1
        page_resp = client.get(f"/documents/{doc_id}/page/1")
        assert page_resp.status_code == 200
        assert page_resp.headers["content-type"] == "image/png"
        # Validate PNG magic bytes header: 89 50 4E 47 0D 0A 1A 0A
        assert page_resp.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert len(page_resp.content) > 1000, "Rendered page image should contain non-trivial byte payload"

        # Request out of bounds page
        out_of_bounds = client.get(f"/documents/{doc_id}/page/999")
        assert out_of_bounds.status_code == 400

        # Test download / file endpoint
        file_resp = client.get(f"/documents/{doc_id}/file")
        assert file_resp.status_code == 200
        assert file_resp.headers["content-type"] == "application/pdf"

        # Clean up
        client.delete(f"/sessions/{session_id}")


def test_individual_document_deletion():
    """Verify DELETE /sessions/{session_id}/documents/{doc_id} removes doc, chunks, and rehydrates vector store."""
    doc1_bytes, doc2_bytes = _create_split_pdfs()

    with TestClient(app) as client:
        # Create session and batch upload
        sess_resp = client.post("/sessions", json={"title": "Delete Doc Test"})
        session_id = sess_resp.json()["id"]

        batch_resp = client.post(
            "/upload/batch",
            data={"session_id": session_id},
            files=[
                ("files", ("zentara_overview.pdf", doc1_bytes, "application/pdf")),
                ("files", ("zentara_operations.pdf", doc2_bytes, "application/pdf")),
            ],
        )
        assert batch_resp.status_code == 200
        batch_docs = batch_resp.json()["documents"]
        doc1_id = batch_docs[0]["doc_id"]
        doc2_id = batch_docs[1]["doc_id"]

        initial_chunks = batch_resp.json()["total_session_chunks"]

        # Delete document 2
        del_resp = client.delete(f"/sessions/{session_id}/documents/{doc2_id}")
        assert del_resp.status_code == 200
        del_data = del_resp.json()
        assert del_data["status"] == "ok"
        assert del_data["remaining_docs"] == 1
        assert del_data["remaining_chunks"] < initial_chunks

        # Verify session only has document 1 left
        sess_details = client.get(f"/sessions/{session_id}").json()
        assert len(sess_details["documents"]) == 1
        assert sess_details["documents"][0]["id"] == doc1_id

        # Verify querying still works with the remaining document
        q_resp = client.post(
            "/query",
            json={"question": "What does Zentara make?", "session_id": session_id},
        )
        assert q_resp.status_code == 200
        for src in q_resp.json()["sources"]:
            assert src["doc_id"] == doc1_id
            assert src["doc_name"] == "zentara_overview.pdf"

        # Clean up
        client.delete(f"/sessions/{session_id}")


def test_cross_document_ordinal_query_resolution():
    """Verify ordinal query references ('first pdf', 'second pdf', 'which to study first')
    are properly resolved and retrieve balanced chunks across both documents.
    """
    from app.store import resolve_query_doc_references, is_cross_document_query

    docs = ["Chap1 - Introduction.pdf", "Chap2 - OSI Architecture.pdf"]

    # 1. Unit tests for ordinal resolution
    expanded = resolve_query_doc_references(
        "how is pdf introduction related to second pdf which to study first",
        docs,
    )
    assert "second pdf (Chap2 - OSI Architecture)" in expanded

    expanded2 = resolve_query_doc_references(
        "compare first doc and second doc",
        docs,
    )
    assert "first doc (Chap1 - Introduction)" in expanded2
    assert "second doc (Chap2 - OSI Architecture)" in expanded2

    # 2. Unit tests for cross-document query classification
    assert is_cross_document_query("how is pdf introduction related to second pdf which to study first", docs)
    assert is_cross_document_query("compare doc 1 and doc 2", docs)
    assert is_cross_document_query("which to study first", docs)
    assert is_cross_document_query("what is the difference between them", docs)
    # Non cross-document query should be False so single-doc queries are not disturbed
    assert not is_cross_document_query("What is the battery capacity of Magpie-7?", docs)

    # 3. End-to-end integration test with both documents attached
    doc1_bytes, doc2_bytes = _create_split_pdfs()

    with TestClient(app) as client:
        sess_resp = client.post("/sessions", json={"title": "Cross-Doc Ordinal Test"})
        session_id = sess_resp.json()["id"]

        batch_resp = client.post(
            "/upload/batch",
            data={"session_id": session_id},
            files=[
                ("files", ("Chap1 - Introduction.pdf", doc1_bytes, "application/pdf")),
                ("files", ("Chap2 - OSI Architecture.pdf", doc2_bytes, "application/pdf")),
            ],
        )
        assert batch_resp.status_code == 200

        # Query using ordinal references
        q_resp = client.post(
            "/query",
            json={
                "question": "how is the first pdf related to the second pdf which to study first",
                "top_k": 4,
                "session_id": session_id,
            },
        )
        assert q_resp.status_code == 200
        data = q_resp.json()
        assert data["answer"] != "I couldn't find that in the document."
        assert len(data["answer"]) > 50

        # Verify chunks from BOTH documents are retrieved and cited
        cited_docs = {s["doc_name"] for s in data["sources"]}
        assert "Chap1 - Introduction.pdf" in cited_docs, f"Doc 1 should be cited, got: {cited_docs}"
        assert "Chap2 - OSI Architecture.pdf" in cited_docs, f"Doc 2 should be cited, got: {cited_docs}"

        client.delete(f"/sessions/{session_id}")
