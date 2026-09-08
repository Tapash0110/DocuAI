# DocuAI — REST API Documentation

## Document Metadata
- **Project Name:** DocuAI (AI-Powered Multi-Modal Document Q&A System)
- **Version:** 1.0.4
- **Author:** Tapash Jaiswal
- **Date:** September 2026

## Overview
DocuAI provides a comprehensive RESTful API built with **FastAPI**. It supports asynchronous request handling, Server-Sent Events (SSE) token streaming, multi-part document ingestion, session persistence, and secure token-based authentication.

- **Base URL:** `http://localhost:8000`
- **Interactive Swagger UI:** `http://localhost:8000/docs`
- **ReDoc UI:** `http://localhost:8000/redoc`
- **Authentication Scheme:** HTTP Bearer token (`Authorization: Bearer <token>`)

---

## 1. Authentication Endpoints

### 1.1 Register User
Creates a new user record with OWASP PBKDF2-HMAC-SHA256 password hashing and returns an RFC 7519 HS256 JWT access token.

- **Method / Path:** `POST /auth/register`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecurePassword123"
}
```

#### Response (`200 OK`)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7a8b9c0d1e2f3a4b",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```

---

### 1.2 Login User
Authenticates user credentials and issues a signed JWT token valid for 3 days.

- **Method / Path:** `POST /auth/login`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "email": "jane@example.com",
  "password": "SecurePassword123"
}
```

#### Response (`200 OK`)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7a8b9c0d1e2f3a4b",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```

---

### 1.3 Get Current User Profile
Fetches authenticated user identity from the Bearer token.

- **Method / Path:** `GET /auth/me`
- **Headers:** `Authorization: Bearer <token>`

#### Response (`200 OK`)
```json
{
  "id": "7a8b9c0d1e2f3a4b",
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

---

## 2. Session Management Endpoints

### 2.1 List Sessions
Returns all chat sessions belonging to the user, ordered by last active descending.

- **Method / Path:** `GET /sessions`
- **Headers:** `Authorization: Bearer <token>` (optional; returns guest sessions if omitted)

#### Response (`200 OK`)
```json
[
  {
    "id": "a1b2c3d4",
    "title": "Zentara Overview & Specs",
    "user_id": "7a8b9c0d1e2f3a4b",
    "created_at": "2026-09-08T18:30:00Z",
    "updated_at": "2026-09-08T19:00:00Z",
    "doc_count": 2,
    "last_filename": "zentara_guide.pdf"
  }
]
```

---

### 2.2 Create Session
Creates a new conversation workspace.

- **Method / Path:** `POST /sessions`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "title": "Robotics Research"
}
```

#### Response (`200 OK`)
```json
{
  "id": "a1b2c3d4",
  "title": "Robotics Research",
  "created_at": "2026-09-08T18:30:00Z",
  "updated_at": "2026-09-08T18:30:00Z"
}
```

---

### 2.3 Get Session Details
Retrieves complete session state, attached documents list, and conversation message history with cited sources.

- **Method / Path:** `GET /sessions/{session_id}`

#### Response (`200 OK`)
```json
{
  "id": "a1b2c3d4",
  "title": "Robotics Research",
  "created_at": "2026-09-08T18:30:00Z",
  "documents": [
    {
      "id": "doc_99a8b7",
      "filename": "zentara_guide.pdf",
      "pages_count": 10,
      "chunks_count": 35
    }
  ],
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "What is the list price of the Magpie-7?",
      "sources": null,
      "created_at": "2026-09-08T18:31:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "The list price of the Magpie-7 is $68,400.",
      "sources": "[{\"doc_name\": \"zentara_guide.pdf\", \"page\": 2, \"score\": 0.812}]",
      "latency_ms": 640,
      "created_at": "2026-09-08T18:31:01Z"
    }
  ]
}
```

---

### 2.4 Update Session Title
Renames an existing session.

- **Method / Path:** `PATCH /sessions/{session_id}`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "title": "Q3 Warehouse Automation Review"
}
```

---

### 2.5 Clear Message History
Clears all message turns in a session while keeping the uploaded documents and vector index intact.

- **Method / Path:** `DELETE /sessions/{session_id}/messages`

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "cleared_session": "a1b2c3d4"
}
```

---

### 2.6 Delete Session
Cascades deletion of the session, associated documents, chunks, and message turns.

- **Method / Path:** `DELETE /sessions/{session_id}`

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "deleted": "a1b2c3d4"
}
```

---

## 3. Document Ingestion Endpoints

### 3.1 Single Document Upload
Uploads and indexes any supported document format (PDF, PPTX, DOCX, TXT, MD, Images).

- **Method / Path:** `POST /upload`
- **Content-Type:** `multipart/form-data`

#### Form Parameters
- `file` (File, required): The binary document file.
- `session_id` (string, optional): Target session ID. If omitted, a new session is created.

#### Response (`200 OK`)
```json
{
  "filename": "cloud_services.docx",
  "chunks_indexed": 12,
  "pages_processed": 2,
  "session_id": "a1b2c3d4",
  "total_session_docs": 1,
  "total_session_chunks": 12,
  "doc_id": "doc_99a8b7"
}
```

---

### 3.2 Batch Document Upload
Uploads and indexes multiple documents simultaneously in a single HTTP request.

- **Method / Path:** `POST /upload/batch`
- **Content-Type:** `multipart/form-data`

#### Form Parameters
- `files` (List of Files, required): Multiple files attached as `files`.
- `session_id` (string, optional): Target session ID.

#### Response (`200 OK`)
```json
{
  "session_id": "a1b2c3d4",
  "total_files_uploaded": 2,
  "total_chunks_indexed": 48,
  "total_pages_processed": 14,
  "documents": [
    { "doc_id": "doc_111", "filename": "specs.pdf", "pages": 8, "chunks": 28 },
    { "doc_id": "doc_222", "filename": "pricing.pptx", "pages": 6, "chunks": 20 }
  ],
  "total_session_docs": 2,
  "total_session_chunks": 48
}
```

---

### 3.3 Pasted Text / Notes Ingestion
Ingests raw text or meeting notes directly into the vector store as a searchable document.

- **Method / Path:** `POST /upload/text`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "title": "Meeting Notes",
  "text": "Discussion on Q4 safety compliance and certification deadlines...",
  "session_id": "a1b2c3d4"
}
```

---

### 3.4 Delete Individual Document
Removes a specific document and its chunks from a session, then automatically rehydrates the in-memory vector index.

- **Method / Path:** `DELETE /sessions/{session_id}/documents/{doc_id}`

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "deleted_doc_id": "doc_111",
  "session_id": "a1b2c3d4",
  "remaining_docs": 1,
  "remaining_chunks": 20
}
```

---

## 4. Document Preview & Download Endpoints

### 4.1 Render Page Image Preview
Renders a specific document page or image (1-indexed) as a high-clarity 108 DPI PNG image via PyPDFium2 for visual inspection.

- **Method / Path:** `GET /documents/{doc_id}/page/{page_num}`

#### Response (`200 OK`)
- **Content-Type:** `image/png`
- **Body:** Binary PNG image data.

---

### 4.2 Download Raw Document File
Downloads the original document file with proper MIME type and filename header.

- **Method / Path:** `GET /documents/{doc_id}/file`

#### Response (`200 OK`)
- **Content-Type:** `application/pdf` (or corresponding MIME)
- **Header:** `Content-Disposition: attachment; filename="document.pdf"`

---

## 5. Question Answering (RAG) Endpoints

### 5.1 Non-Streaming Query
Performs hybrid search, cross-encoder reranking, and returns a grounded answer with cited chunks.

- **Method / Path:** `POST /query`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "question": "What is the continuous operating battery run time of the Magpie-7?",
  "top_k": 3,
  "session_id": "a1b2c3d4"
}
```

#### Response (`200 OK`)
```json
{
  "answer": "The Magpie-7 has a continuous operating battery run time of 14 hours with rapid inductive docking.",
  "sources": [
    {
      "chunk_id": 4,
      "text": "Battery run time is 14 continuous operating hours with rapid magnetic inductive docking...",
      "page": 2,
      "score": 0.895,
      "doc_name": "fleet_overview.pptx",
      "doc_id": "doc_222"
    }
  ],
  "session_id": "a1b2c3d4",
  "latency_ms": 780
}
```

---

### 5.2 Streaming Query (Server-Sent Events)
Streams tokens in real-time as they are generated by the LLM, accompanied by live pipeline progress status events.

- **Method / Path:** `POST /query/stream`
- **Content-Type:** `application/json`
- **Accept Header:** `text/event-stream`

#### Stream Events Protocol
```http
data: {"status": "Searching document index..."}

data: {"status": "Analyzing excerpts with Cross-Encoder..."}

data: {"status": "Generating grounded response..."}

data: {"token": "The "}

data: {"token": "Magpie-7 "}

data: {"token": "battery "}

data: {"token": "runs for 14 hours."}

data: {"sources": [{"chunk_id": 4, "text": "...", "page": 2, "score": 0.895, "doc_name": "fleet_overview.pptx", "doc_id": "doc_222"}], "session_id": "a1b2c3d4", "latency_ms": 712, "final_answer": "The Magpie-7 battery runs for 14 hours."}
```

---

## 6. System Health Endpoint

### 6.1 Health Check
Returns overall system status, total active sessions, and indexed chunks count.

- **Method / Path:** `GET /health`

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "total_sessions": 3,
  "active_session_id": "a1b2c3d4",
  "chunks_indexed": 48,
  "filename": "fleet_overview.pptx",
  "pages": 6,
  "active_documents": [
    { "id": "doc_111", "filename": "specs.pdf", "pages": 8, "chunks": 28 },
    { "id": "doc_222", "filename": "fleet_overview.pptx", "pages": 6, "chunks": 20 }
  ]
}
```
