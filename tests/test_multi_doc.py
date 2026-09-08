"""Tests for multi-PDF uploads per session and SQLite persistence."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import SAMPLE_PDF


def test_multi_pdf_in_single_chat_and_persistence():
    with TestClient(app) as client:
        # 1. Create a session
        res = client.post("/sessions", json={"title": "Multi-Doc Test Chat"})
        assert res.status_code == 200
        session = res.json()
        session_id = session["id"]
        assert session["title"] == "Multi-Doc Test Chat"

        # 2. Upload first PDF to session
        with open(SAMPLE_PDF, "rb") as f:
            r1 = client.post(
                "/upload",
                files={"file": ("doc1_sample.pdf", f, "application/pdf")},
                data={"session_id": session_id},
            )
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["session_id"] == session_id
        assert d1["total_session_docs"] == 1
        initial_chunks = d1["chunks_indexed"]
        assert initial_chunks > 0

        # 3. Upload second PDF to the same session
        with open(SAMPLE_PDF, "rb") as f:
            r2 = client.post(
                "/upload",
                files={"file": ("doc2_pricing.pdf", f, "application/pdf")},
                data={"session_id": session_id},
            )
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["session_id"] == session_id
        assert d2["total_session_docs"] == 2
        assert d2["total_session_chunks"] == initial_chunks * 2

        # 4. Verify session details endpoint returns both documents
        sess_details = client.get(f"/sessions/{session_id}").json()
        assert len(sess_details["documents"]) == 2
        doc_names = [d["filename"] for d in sess_details["documents"]]
        assert "doc1_sample.pdf" in doc_names
        assert "doc2_pricing.pdf" in doc_names

        # 5. Query the session and verify sources cite document names
        q_res = client.post(
            "/query",
            json={
                "question": "What is the list price of the Magpie-7?",
                "top_k": 3,
                "session_id": session_id,
            },
        )
        assert q_res.status_code == 200
        q_data = q_res.json()
        assert "sources" in q_data
        assert len(q_data["sources"]) > 0
        for src in q_data["sources"]:
            assert "doc_name" in src
            assert src["doc_name"] in ["doc1_sample.pdf", "doc2_pricing.pdf"]

        # 6. Verify messages were saved in session history
        history_res = client.get(f"/sessions/{session_id}").json()
        assert len(history_res["messages"]) >= 2
        assert history_res["messages"][0]["role"] == "user"
        assert history_res["messages"][1]["role"] == "assistant"

        # Verify clear messages endpoint
        clear_res = client.delete(f"/sessions/{session_id}/messages")
        assert clear_res.status_code == 200
        history_cleared = client.get(f"/sessions/{session_id}").json()
        assert len(history_cleared["messages"]) == 0

        # 7. Update session title
        patch_res = client.patch(f"/sessions/{session_id}", json={"title": "Updated Title"})
        assert patch_res.status_code == 200

        sess_updated = client.get(f"/sessions/{session_id}").json()
        assert sess_updated["title"] == "Updated Title"

        # 8. Clean up / delete session
        del_res = client.delete(f"/sessions/{session_id}")
        assert del_res.status_code == 200

        # Verify 404 after deletion
        assert client.get(f"/sessions/{session_id}").status_code == 404
