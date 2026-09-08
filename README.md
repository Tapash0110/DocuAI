# DocuAI — AI-Powered Multi-Modal Document Q&A System

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![FAISS](https://img.shields.io/badge/Vector_Store-FAISS-green.svg)](https://github.com/facebookresearch/faiss)
[![BM25](https://img.shields.io/badge/Lexical_Search-BM25-orange.svg)](https://github.com/dorianbrown/rank_bm25)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **DocuAI** is a production-grade, multi-modal Retrieval-Augmented Generation (RAG) platform. Upload PDFs, PowerPoint slides, Word documents, scanned images (OCR), or raw notes, and query them in natural language using text or voice. DocuAI combines dense vector search (FAISS) with sparse lexical search (BM25) and Cross-Encoder reranking to deliver grounded, hallucination-free answers with clickable source citations.

---

## 📋 Problem Statement & Objectives

### Problem Statement
> **"Build an application that allows users to upload one or more PDF documents and ask questions in natural language. The system should understand the uploaded content, identify the most relevant information, and generate accurate responses with references to the source material. The objective is to evaluate how candidates handle unstructured data, information retrieval, backend development, and practical AI integration."**

### Core Evaluation Objectives & How DocuAI Delivers

| Evaluation Criteria | DocuAI Implementation & Exceeded Scope |
| :--- | :--- |
| **Handling Unstructured Data** | Beyond standard text PDFs, DocuAI ingests **multi-document corpora**, parsed PowerPoint slides (`.pptx`), Word documents (`.docx`), plain text/markdown (`.txt`, `.md`, `.csv`, `.json`), **scanned PDF/image documents via RapidOCR (ONNX)**, and raw pasted text notes. |
| **Information Retrieval** | Implements **two-stage hybrid retrieval**: Dense vector similarity (FAISS `IndexFlatIP`) + Sparse lexical keyword matching (BM25) fused via **Reciprocal Rank Fusion (RRF, k=60)**, followed by a **Cross-Encoder (`ms-marco-MiniLM-L-6-v2`) reranking stage** with guaranteed slots for dense tabular content. |
| **Backend Development** | Built on **FastAPI** with asynchronous Server-Sent Events (SSE) token streaming, real-time pipeline status notifications, persistent **SQLite** storage (sessions, messages, chunk embeddings), and secure **OWASP PBKDF2-HMAC-SHA256** user authentication with RFC 7519 HS256 JWT tokens. |
| **Practical AI Integration** | Multi-provider swappable LLM client supporting **Groq** (LLaMA 3.3 70B / 3.1 8B), **OpenAI** (GPT-4o / GPT-4o-mini), and **Anthropic** (Claude 3.5 Sonnet / Haiku). Features strict anti-hallucination system prompts, multi-turn conversational context memory, and **browser-native bidirectional Voice AI (STT & TTS)**. |

---

## ✨ Key Features

### 📄 1. Multi-Format & Multi-Document Ingestion
- **Multi-PDF Support:** Upload multiple PDF documents into a single chat session or attach additional documents mid-conversation.
- **PowerPoint Presentations (`.pptx`, `.ppt`):** Slide-by-slide text extraction, structured table parsing, and speaker note indexing.
- **Word Documents (`.docx`, `.doc`):** Heading hierarchy, paragraph structure, and markdown-formatted table extraction with logical ~450-word pagination.
- **Scanned Images & OCR (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`):** Integrated **RapidOCR (ONNX Runtime)** extracts text from scanned pages and embedded slide images without cloud API dependencies.
- **Raw Pasted Text / Notes:** Instantly ingest snippets, code logs, or meeting notes via the `/upload/text` endpoint.
- **Visual Page Preview:** Integrated `pypdfium2` engine renders 108 DPI crisp PNG previews of referenced PDF pages directly inside the excerpt inspector.

### 🔍 2. Advanced Hybrid Retrieval & Reranking
- **Dense Vector Search:** Generates 384-dimensional unit-normalized embeddings via `all-MiniLM-L6-v2` running locally on CPU, searched via FAISS `IndexFlatIP` (exact cosine similarity).
- **Sparse Keyword Search:** Tokenized BM25 index captures exact acronyms, model names, IDs, and tabular headers (e.g., "CEO", "MTBF", "SOC-2").
- **Reciprocal Rank Fusion (RRF):** Merges dense and sparse ranked candidate lists using $RRF(d) = \sum \frac{1}{k + r(d)}$ with constant $k=60$.
- **Cross-Encoder Reranking:** Deep transformer reranker (`ms-marco-MiniLM-L-6-v2`) re-scores question-chunk pairs with a *guaranteed-slots strategy* to protect dense tabular chunks from being buried.

### 🎙️ 3. Audio & Voice Multimodal Q&A
- **Voice-to-Text (STT):** Dictate questions directly into the input bar using continuous Speech Recognition with real-time interim streaming.
- **Text-to-Speech (TTS):** Listen to generated answers read aloud using curated natural voices.
- **In-Flow Streaming Speech Player:** Automatically buffers incoming SSE tokens and speaks completed sentences sequentially as the LLM generates them.
- **Zero Cost:** Runs entirely on native browser Web Speech APIs without paid third-party voice APIs.

### 🔒 4. Secure Authentication & User Accounts
- **Password Security:** OWASP-compliant PBKDF2-HMAC-SHA256 password hashing with 100,000 rounds and random 16-byte cryptographic salt.
- **Session Tokens:** RFC 7519 HS256 JSON Web Tokens (JWT) with 3-day validity.
- **User-Scoped Data:** Private sessions and documents isolated per user, with guest/anonymous access support.
- **Auth Landing Page:** Modern login/signup modal with password reveal, validation, and theme switching.

### 💾 5. Persistence, History & Chat Management
- **SQLite Database:** Stores chat sessions, message history with latency tracking, document metadata, chunks, and cached embedding BLOBs for instantaneous session rehydration.
- **Export Conversation:** Download your complete chat transcript with timestamped citations as a formatted Markdown (`.md`) file.
- **Clear Chat History:** Wipe conversation turns in one click while preserving document indexes.
- **Document Management:** Delete individual documents from a session with automatic index rehydration.

### ⚡ 6. Real-Time Streaming & UX
- **Server-Sent Events (SSE):** Token-by-token streaming with live pipeline phase indicators:
  1. `Searching document index...`
  2. `Analyzing excerpts with Cross-Encoder...`
  3. `Generating grounded response...`
- **Citation Badges:** Clickable citation pills showing document name, page number, and similarity score, opening an excerpt drawer with the exact source text and visual page preview.
- **Strict Anti-Hallucination:** Answers strictly from context; returns `**I couldn't find that in the document.**` when the query is off-topic or out of scope.
- **Dual Themes:** Clean, polished Dark mode (default) and Light mode with Tailwind CSS v4.

---

## 🏗️ Pipeline Architecture

```
                                    DOCUAI ARCHITECTURE OVERVIEW
                                    
   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                   INGESTION PIPELINE                                        │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
      User Upload
      (PDF, PPTX, DOCX, TXT, PNG/JPG)
            │
            ▼
   ┌──────────────────┐
   │ Universal Router │ ──► [.pdf]  ──► pypdf (text) + RapidOCR fallback (scanned pages)
   │ (document_loader)│ ──► [.pptx] ──► python-pptx (shapes, tables, notes) + Image OCR
   └──────────────────┘ ──► [.docx] ──► python-docx (paragraphs, headings, tables)
            │           ──► [Images]──► RapidOCR ONNX Runtime (direct OCR)
            ▼
   ┌──────────────────┐
   │ Text Chunking    │ ──► 500 characters / 100 characters overlap (Page-Isolated)
   └──────────────────┘
            │
            ▼
   ┌──────────────────┐
   │ Sentence-        │ ──► all-MiniLM-L6-v2 (384-dimensional unit-normalized vectors)
   │ Transformers     │     Runs 100% locally on CPU (~80 MB footprint)
   └──────────────────┘
            │
            ├─────────────────────────────────────────┬────────────────────────────────────────┐
            ▼                                         ▼                                        ▼
   ┌──────────────────┐                      ┌──────────────────┐                     ┌──────────────────┐
   │ FAISS Index      │                      │ BM25 Index       │                     │ SQLite Database  │
   │ (Dense Vector)   │                      │ (Sparse Lexical) │                     │ (Chunks & Blobs) │
   └──────────────────┘                      └──────────────────┘                     └──────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                    QUERY PIPELINE                                           │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
      User Query (Voice STT or Typed Text)
            │
            ▼
   ┌──────────────────┐
   │ Query Embedding  │ ──► all-MiniLM-L6-v2 (Normalized Query Vector)
   └──────────────────┘
            │
            ├─────────────────────────────────────────┐
            ▼                                         ▼
   ┌──────────────────┐                      ┌──────────────────┐
   │ FAISS Search     │                      │ BM25 Search      │
   │ (Dense Cosine)   │                      │ (Exact Keyword)  │
   └──────────────────┘                      └──────────────────┘
            │                                         │
            └────────────────────┬────────────────────┘
                                 ▼
   ┌──────────────────────────────────────────────────┐
   │ Reciprocal Rank Fusion (RRF, k=60)               │
   │ Combines dense & sparse candidate rankings       │
   └──────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────┐
   │ Cross-Encoder Reranker (ms-marco-MiniLM-L-6-v2)  │
   │ Guaranteed-slots strategy preserves table chunks │
   └──────────────────────────────────────────────────┘
                                 │
                                 ▼ Top-K Chunks
   ┌──────────────────────────────────────────────────┐
   │ Strict Anti-Hallucination Prompt Builder         │
   │ Includes conversation history (last 5 turns)     │
   └──────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────┐
   │ Swappable LLM (Groq / OpenAI / Anthropic)        │
   │ temperature=0.2, max_tokens=800                  │
   └──────────────────────────────────────────────────┘
                                 │
                                 ▼ Server-Sent Events (SSE)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Web Client (React 19)                                                   │
   │ • Live Token Rendering & Markdown Formatting                            │
   │ • In-Flow Streaming Speech Playback (TTS)                               │
   │ • Clickable Source Pills & Visual Page Inspector                        │
   │ • Persisted to SQLite History & LocalStorage                            │
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Tech Stack

### Backend & AI Pipeline
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **FastAPI** | `0.115.0` | High-performance asynchronous REST API framework |
| **Uvicorn** | `0.32.0` | ASGI production server |
| **Sentence-Transformers** | `3.2.1` | Local embedding model (`all-MiniLM-L6-v2`, 384 dimensions) |
| **FAISS (faiss-cpu)** | `1.9.0` | In-memory dense vector indexing and cosine search |
| **Rank-BM25** | `0.2.2` | Sparse lexical keyword retrieval |
| **Cross-Encoder** | `ms-marco-MiniLM-L-6-v2` | Second-stage passage reranking |
| **RapidOCR (ONNX Runtime)** | `1.4.4` | CPU-based optical character recognition for scans/images |
| **PyPDFium2** | `5.13.0` | PDF page image rendering (108 DPI preview) and rasterization |
| **PyPDF** | `5.1.0` | PDF text and structure extraction |
| **python-pptx** | `1.0.2` | PowerPoint slide, table, and speaker note extraction |
| **python-docx** | `1.2.0` | Word document paragraphs, headings, and table parsing |
| **SQLite3** | Native | Relational database for sessions, messages, documents & chunk BLOBs |
| **Groq SDK** | `>=0.25.0` | Ultra-fast LLaMA 3.3 70B & 3.1 8B streaming inference |
| **OpenAI SDK** | `1.54.0` | GPT-4o / GPT-4o-mini provider integration |
| **Anthropic SDK** | `0.39.0` | Claude 3.5 Sonnet / Haiku provider integration |
| **uv** | Latest | Astral ultra-fast Python package manager & resolver |

### Frontend UI
| Technology | Purpose |
| :--- | :--- |
| **React 19** | Component-driven reactive UI |
| **Vite** | Next-generation fast frontend bundler & dev server |
| **Tailwind CSS v4** | Modern utility-first CSS styling |
| **Lucide React** | Consistent iconography |
| **React Markdown** | Safe Markdown rendering for LLM answers and tables |
| **Web Speech API** | Browser-native SpeechRecognition (STT) and SpeechSynthesis (TTS) |

---

## ⚙️ System Requirements

### Hardware Requirements
| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Processor (CPU)** | Dual-Core 2.0 GHz (x86_64 or ARM64) | Quad-Core 2.5 GHz+ (Intel i5/i7, AMD Ryzen, Apple M1/M2/M3) |
| **Memory (RAM)** | 4 GB RAM | 8 GB RAM or higher (smooth parallel embedding & OCR) |
| **Disk Storage** | 2 GB free disk space | 5 GB free disk space (models cache is ~250 MB total) |
| **GPU Acceleration** | **Not Required** | Not required (models are lightweight and CPU-optimized) |

### Software Requirements
| Software | Required Version |
| :--- | :--- |
| **Operating System** | Windows 10/11, macOS 12+ (Intel / Apple Silicon), or Linux (Ubuntu 20.04+, Debian, Fedora) |
| **Python** | Python `3.10`, `3.11`, or `3.12` |
| **Node.js & npm** | Node.js `v18.0.0+` and npm `v9.0.0+` |
| **Web Browser** | Google Chrome, Microsoft Edge, Brave, or Safari (for Web Speech API voice features) |
| **Git** | `v2.30+` |

---

## 💰 Cost & Pricing Analysis: 100% Free vs. Paid

DocuAI is architected from the ground up to be **fully operational at zero cost ($0.00)** using open-source models and free API tiers, while supporting premium enterprise models when desired.

### Cost Breakdown Table

| Component | Default Engine / Provider | Cost | Notes |
| :--- | :--- | :--- | :--- |
| **Embeddings** | `sentence-transformers/all-MiniLM-L6-v2` | **FREE ($0.00)** | Runs locally on CPU (~80 MB model download once) |
| **Reranking** | `cross-encoder/ms-marco-MiniLM-L-6-v2` | **FREE ($0.00)** | Runs locally on CPU (~80 MB model download once) |
| **Vector Search** | `FAISS (faiss-cpu)` | **FREE ($0.00)** | Open-source in-memory index |
| **Keyword Search** | `rank-bm25` | **FREE ($0.00)** | Open-source Python algorithm |
| **OCR & Vision** | `rapidocr-onnxruntime` | **FREE ($0.00)** | Local ONNX models, zero cloud OCR API costs |
| **Audio (STT & TTS)** | Web Speech API | **FREE ($0.00)** | Native browser speech engine (no Whisper or ElevenLabs fees) |
| **Database** | Embedded SQLite | **FREE ($0.00)** | Serverless, local zero-maintenance database |
| **Default LLM Provider** | **Groq Cloud API** | **FREE ($0.00)** | Generous free tier: 30 RPM, 14,400 Requests/Day on LLaMA 3.3 70B |
| **Optional LLM: OpenAI** | `gpt-4o-mini` / `gpt-4o` | Paid (Pay-as-you-go) | User brings own key (~$0.15 / 1M input tokens for mini) |
| **Optional LLM: Anthropic**| `claude-3-5-sonnet` / `haiku` | Paid (Pay-as-you-go) | User brings own key (~$0.25 / 1M tokens for Haiku) |

> 💡 **Summary:** If you run DocuAI with the default **Groq** configuration, your total operational cost is **$0.00**.

---

## 🚀 Setup & Installation Guide

Follow these steps to set up and launch DocuAI on your machine.

### 1. Clone the Repository

```bash
git clone https://github.com/Tapash0110/DocuAI.git
```

---

### 2. Install `uv` (Fast Python Package Manager)

DocuAI uses **uv** for ultra-fast dependency resolution and automatic virtual environment management.

#### Windows (PowerShell)
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### macOS / Linux
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Restart your terminal and verify:
```bash
uv --version
```

---

### 3. Install Backend Dependencies

From the project root directory, run:

```bash
uv sync
```

This automatically:
- Creates the `.venv` virtual environment.
- Installs all dependencies locked in `uv.lock`.
- Installs development tools (e.g. `pytest`, `httpx`).

---

### 4. Configure Environment Variables

Create your local `.env` configuration from `.env.example`:

#### Windows (PowerShell)
```powershell
Copy-Item .env.example .env
```

#### macOS / Linux
```bash
cp .env.example .env
```

Open `.env` in any text editor and configure your chosen LLM provider:

```ini
# Choose ONE provider: groq | openai | anthropic
LLM_PROVIDER=groq

# Only the key for your chosen provider is required:
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# If using OpenAI:
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-proj-your_openai_key_here
# OPENAI_MODEL=gpt-4o-mini

# If using Anthropic:
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
# ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

> 🔑 **Need a free key?** Get an instant free API key at [Groq Console](https://console.groq.com/).

---

### 5. Start the FastAPI Backend Server

Run the backend server from the project root:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

The backend will start at:
- **API Server:** `http://localhost:8000`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`
---

### 6. Install & Start the React Frontend

Open a **new terminal tab/window**, navigate into the `frontend/` directory, and launch the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

The frontend web application will start at:
- **Application URL:** `http://localhost:5173`

---

### 7. Explore DocuAI in the Browser

1. Open `http://localhost:5173` in your browser.
2. Sign up with your name, email, and password (or test in guest mode).
3. Drag and drop single or multiple documents (`.pdf`, `.pptx`, `.docx`, `.txt`, images) or paste text notes.
4. Ask questions by typing or clicking the **Microphone** icon for voice queries.
5. Watch the answer stream in real-time with live progress indicators.
6. Click on any citation badge to view source excerpts or inspect rendered document pages.
7. Click **Export** in the header to download your chat history as a `.md` file, or **Clear** to wipe message history.

---

## 🧪 Running Automated Tests & Evaluation Harness

DocuAI includes an automated evaluation harness with 19 benchmark test cases covering:
- **Single-hop factual retrieval**
- **Specific numbers & metrics**
- **Tabular & financial data**
- **Multi-hop reasoning**
- **Negative refusals** (out-of-scope queries)
- **Tricky keyword vs semantic matches**

To run the full test suite:

```bash
uv run pytest
```

To run with verbose output and individual test names:

```bash
uv run pytest -v
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Register a new user with PBKDF2 hashing and receive a 3-day JWT |
| `POST` | `/auth/login` | Authenticate with email/password and receive a 3-day JWT |
| `GET` | `/auth/me` | Fetch authenticated user profile |
| `GET` | `/health` | Health check endpoint returning indexed chunks and documents count |
| `GET` | `/sessions` | List all chat sessions for the authenticated user |
| `POST` | `/sessions` | Create a new empty chat session |
| `GET` | `/sessions/{id}` | Retrieve full session details, active documents, and message history |
| `PATCH` | `/sessions/{id}` | Update session title |
| `DELETE`| `/sessions/{id}` | Delete session, attached documents, and chunk embeddings |
| `DELETE`| `/sessions/{id}/messages` | Clear chat message history for a session |
| `POST` | `/upload` | Upload and index a single document (PDF, PPTX, DOCX, TXT, OCR Image) |
| `POST` | `/upload/batch` | Upload and index multiple documents in a single request |
| `POST` | `/upload/text` | Ingest pasted text notes into a session as a searchable document |
| `DELETE`| `/sessions/{id}/documents/{doc_id}` | Remove a single document and rehydrate vector index |
| `POST` | `/query` | Non-streaming question answering with cited sources |
| `POST` | `/query/stream` | Server-Sent Events (SSE) streaming answer with progress states |
| `GET` | `/documents/{doc_id}/page/{num}` | Render a 108 DPI PNG image of a specific document page |
| `GET` | `/documents/{doc_id}/file` | Download the raw uploaded file |

---

## 📁 Project Directory Structure

```text
chat-with-pdf-rag/
├── docs/
│   ├── DocuAI_Design_Document.md    # System architecture, ingestion/query pipelines & Mermaid diagrams
│   ├── Unit_Test_Report.md          # Real pytest execution report (34 tests, pass/fail metrics)
│   └── API_DOCUMENTATION.md         # Full REST API endpoint reference and schemas
│
├── app/
│   ├── __init__.py
│   ├── auth.py                      # PBKDF2 password hashing & RFC 7519 HS256 JWT auth
│   ├── db.py                        # SQLite persistence (sessions, chunks, embeddings, messages)
│   ├── document_loader.py           # Universal router (PDF, PPTX, DOCX, TXT, RapidOCR)
│   ├── llm.py                       # Abstract LLM client (Groq, OpenAI, Anthropic)
│   ├── main.py                      # FastAPI endpoints, CORS, SSE streaming, prompts
│   ├── pdf_loader.py                # PDF text extraction with RapidOCR fallback
│   ├── rag.py                       # 500/50 sliding window chunking & sentence embeddings
│   ├── reranker.py                  # Cross-Encoder reranker with guaranteed-slots strategy
│   └── store.py                     # Hybrid store (FAISS IndexFlatIP + BM25 + RRF fusion)
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── api.js               # Central API client for FastAPI endpoints
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx       # Streaming chat canvas, voice controls, input bar
│   │   │   ├── Header.jsx           # Document pills, export chat, clear history
│   │   │   ├── LandingPage.jsx      # Auth login/signup modal with theme switcher
│   │   │   ├── OtherFormatsModal.jsx# Multi-format & raw notes ingestion modal
│   │   │   ├── Sidebar.jsx          # Session list, multi-doc manager, search
│   │   │   └── SourceCard.jsx       # Excerpt drawer & visual page preview
│   │   ├── utils/
│   │   │   └── speech.js            # Web Speech API (continuous STT & in-flow streaming TTS)
│   │   ├── App.jsx                  # Root application state & theme provider
│   │   ├── index.css                # Tailwind CSS styles & custom scrollbars
│   │   └── main.jsx                 # React DOM mount point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── tests/
│   ├── conftest.py                  # Pytest fixtures and mock client
│   ├── eval_questions.json          # 19 benchmark test questions across 6 categories
│   ├── test_eval.py                 # Automated evaluation harness
│   ├── test_multi_doc.py            # Multi-PDF session tests
│   ├── test_multi_doc_eval.py       # Cross-doc retrieval & page rendering tests
│   ├── test_multi_format_ingestion.py # DOCX, PPTX, image OCR tests
│   └── test_scanned_pdf_and_chunking.py # Bitmap PDF & chunking tests
│
├── data/                            # Local SQLite database & upload storage (gitignored)
├── .env.example                     # Template for API keys & model configuration
├── .gitignore
├── pyproject.toml                   # Python dependencies and project metadata
├── uv.lock                          # Deterministic dependency lockfile
├── SUBMISSION.md                    # Cadence submission checklist & deliverable mapping
└── README.md                        # Comprehensive project documentation
```

---

## 🔒 Security & Privacy

- **Data Privacy:** All document chunking, embedding generation (`all-MiniLM-L6-v2`), BM25 indexing, and OCR execution happen **100% locally on your machine**. Documents are never sent to external third-party embedding services.
- **LLM Data Transmission:** Only the specific top-K retrieved context snippets relevant to your query are transmitted to your selected LLM inference provider (Groq/OpenAI/Anthropic).
- **Credentials:** API keys and JWT secret keys are loaded exclusively from `.env` and environment variables. Never commit `.env` or database files to version control.
