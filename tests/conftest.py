"""Shared fixtures for the evaluation harness."""
import json
import os
import tempfile
from pathlib import Path

# ISOLATE TESTS: All automated tests run against an ephemeral database so user chat history is NEVER touched
_test_dir = tempfile.mkdtemp(prefix="docuai_test_suite_")
_test_db = os.path.join(_test_dir, "test_docuai.db")
os.environ["DOCUAI_DB_PATH"] = _test_db

import pytest
from fastapi.testclient import TestClient

from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PDF = PROJECT_ROOT / "data" / "sample_test_file.pdf"
EVAL_QUESTIONS = PROJECT_ROOT / "tests" / "eval_questions.json"


@pytest.fixture(scope="session")
def client():
    """Create a TestClient and upload the sample PDF once for all tests."""
    with TestClient(app) as c:
        with open(SAMPLE_PDF, "rb") as f:
            resp = c.post("/upload", files={"file": ("sample_test_file.pdf", f, "application/pdf")})
        assert resp.status_code == 200, f"Upload failed: {resp.text}"
        yield c


def load_eval_questions():
    """Load the 19 evaluation questions from JSON."""
    with open(EVAL_QUESTIONS) as f:
        return json.load(f)
