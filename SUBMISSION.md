# Cadence Project 1: AI-Powered Document Q&A System — Submission Package

## 📌 Submission Overview
- **Project Name:** DocuAI (AI-Powered Multi-Modal Document Q&A System)
- **Version:** 1.0.4
- **Author:** Tapash Jaiswal
- **Date:** September 2026

This submission package contains the complete deliverables for **Project 1: AI-Powered Document Q&A System**.

DocuAI is a production-ready, multi-modal Retrieval-Augmented Generation (RAG) platform. It allows users to upload one or more documents (PDFs, PowerPoint presentations, Word documents, scanned images via OCR, and raw notes), ask complex natural language questions via text or voice, and receive grounded, cited answers in real time.

---

## 🎯 Alignment with Cadence Evaluation Criteria

| Evaluation Focus | Problem Statement Requirement | DocuAI Implementation |
| :--- | :--- | :--- |
| **Handling Unstructured Data** | Ingest and understand PDF documents | • Native PDF extraction via `pypdf`<br>• **Automatic OCR fallback** for scanned bitmap PDFs via `RapidOCR` ONNX<br>• Universal support for PowerPoint (`.pptx`), Word (`.docx`), Markdown, text, and direct image files<br>• Sentence-aware sliding-window chunking (500 chars / 100 overlap) strictly bound to individual pages |
| **Information Retrieval** | Identify the most relevant information | • **Two-Stage Hybrid Search:** Dense vector embeddings (`all-MiniLM-L6-v2`) in FAISS `IndexFlatIP` combined with sparse lexical search via `rank-bm25`<br>• **Reciprocal Rank Fusion (RRF, k=60)** to balance semantic and exact keyword matches<br>• **Cross-Encoder Reranker (`ms-marco-MiniLM-L-6-v2`)** with guaranteed-slots strategy to safeguard dense tabular data |
| **Backend Development** | Production-grade backend architecture | • **FastAPI** asynchronous server with Server-Sent Events (SSE) token streaming<br>• Real-time pipeline step status notifications<br>• **SQLite database** persisting sessions, documents, chunks, precomputed embeddings, and conversation turns<br>• **OWASP PBKDF2-HMAC-SHA256** password hashing and RFC 7519 HS256 JWT security |
| **Practical AI Integration** | Natural language Q&A with grounded references | • Multi-provider swappable LLM engine (Groq, OpenAI, Anthropic)<br>• Strict anti-hallucination prompts (`**I couldn't find that in the document.**`)<br>• Multi-turn conversational memory (last 5 turns)<br>• **Browser-native Voice Q&A:** Voice-to-text dictation + in-flow streaming text-to-speech audio player<br>• Interactive citation badges with 108 DPI rendered page images via `pypdfium2` |

---

## ⚡ Quick Start Instructions

### 1. Backend Setup
```bash
# Clone and enter directory
git clone https://github.com/Tapash0110/DocuAI.git

# Install dependencies using uv
uv sync

# Configure API key in .env
cp .env.example .env

# Run FastAPI backend
uv run uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup (in a separate terminal)
```bash
cd frontend
npm install
npm run dev
```

- **Web Application:** `http://localhost:5173`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

### 3. Run Automated Tests
```bash
uv run pytest -v
```

---

## 📂 Source Code Layout

```text
chat-with-pdf-rag/
├── docs/
│   ├── DocuAI_Design_Document.md   # System design, architecture & Mermaid diagrams
│   ├── Unit_Test_Report.md         # Real pytest results (26 passed, 8 analyzed)
│   └── API_DOCUMENTATION.md        # Comprehensive FastAPI endpoint reference
│
├── app/
│   ├── auth.py                     # PBKDF2 password hashing & JWT tokens
│   ├── db.py                       # SQLite persistence layer
│   ├── document_loader.py          # Universal router (PDF, PPTX, DOCX, TXT, RapidOCR)
│   ├── llm.py                      # Swappable LLM clients (Groq, OpenAI, Anthropic)
│   ├── main.py                     # FastAPI routes, SSE streaming, prompts
│   ├── pdf_loader.py               # PDF loader with PyPDFium2 / RapidOCR fallback
│   ├── rag.py                      # Sentence chunking & MiniLM embeddings
│   ├── reranker.py                 # Cross-Encoder reranker with guaranteed slots
│   └── store.py                    # Hybrid store (FAISS + BM25 + RRF)
│
├── frontend/
│   ├── src/
│   │   ├── components/             # React UI components (Chat, Sidebar, Header, Modals)
│   │   ├── utils/speech.js         # Web Speech API STT and streaming TTS
│   │   └── App.jsx                 # Application state & auth flow
│   └── package.json
│
├── tests/
│   ├── test_eval.py                # 19-question RAG benchmark
│   ├── test_multi_doc.py           # Multi-PDF session tests
│   ├── test_multi_doc_eval.py      # Cross-doc retrieval & page rendering tests
│   ├── test_multi_format_ingestion.py # DOCX, PPTX, image OCR tests
│   └── test_scanned_pdf_and_chunking.py # Bitmap PDF & chunking tests
│
├── README.md                       # Main user & developer guide
├── SUBMISSION.md                   # Cadence submission checklist (this document)
├── pyproject.toml                  # Python dependencies
└── uv.lock                         # Deterministic lockfile
```
