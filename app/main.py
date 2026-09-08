"""FastAPI backend for DocuAI.

Features:
- Multi-PDF upload per chat session
- Mid-chat additional PDF uploads
- Cross-document hybrid search (FAISS + BM25) + Cross-Encoder reranking
- Persistent SQLite storage for sessions, documents, embeddings, and chat history
- Non-streaming (/query) and streaming (/query/stream) responses
"""
import json
import re
import time
import unicodedata
import uuid
from typing import Any, Dict, Iterator, List, Optional
from pathlib import Path
import mimetypes
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

load_dotenv()  # must happen before importing modules that read env

from app.pdf_loader import load_pdf
from app.document_loader import load_document, load_raw_text
from app.rag import chunk_pages, embed_texts
from app.store import store, resolve_query_doc_references
from app.llm import get_llm_client
from app.reranker import rerank
from app import auth, db

SUPPORTED_EXTENSIONS = {
    ".pdf", ".pptx", ".ppt", ".docx", ".doc",
    ".txt", ".md", ".markdown", ".csv", ".json", ".log", ".rst",
    ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff",
}

app = FastAPI(
    title="DocuAI - Multi-PDF RAG Service",
    description="Upload multiple PDFs per chat, ask grounded cross-document questions, and persist chat history.",
    version="0.7.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_HISTORY_TURNS = 5  # keep last N exchanges (user + assistant pairs)


# ---------- Schemas ----------

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=200)
    password: str = Field(..., min_length=4, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    password: str = Field(..., min_length=1, max_length=128)


class AuthUser(BaseModel):
    id: str
    name: str
    email: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class CreateSessionRequest(BaseModel):
    title: Optional[str] = Field(default="New Chat", max_length=100)


class UpdateSessionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class UploadResponse(BaseModel):
    filename: str
    chunks_indexed: int
    pages_processed: int
    session_id: str
    total_session_docs: int
    total_session_chunks: int
    doc_id: Optional[str] = ""


class BatchUploadItem(BaseModel):
    doc_id: str
    filename: str
    pages: int
    chunks: int


class BatchUploadResponse(BaseModel):
    session_id: str
    total_files_uploaded: int
    total_chunks_indexed: int
    total_pages_processed: int
    documents: List[BatchUploadItem]
    total_session_docs: int
    total_session_chunks: int


class TextUploadRequest(BaseModel):
    title: Optional[str] = Field(default="Pasted Notes", max_length=150)
    text: str = Field(..., min_length=1)
    session_id: Optional[str] = Field(default=None)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=3, ge=1, le=10)
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID for conversation memory and document scope.",
    )


class Source(BaseModel):
    chunk_id: int
    text: str
    page: int
    score: float
    doc_name: str
    doc_id: Optional[str] = ""


class QueryResponse(BaseModel):
    answer: str
    sources: List[Source]
    session_id: str
    latency_ms: Optional[int] = None


# ---------- Prompt Formatting & Response Cleaning ----------

NOT_FOUND_STANDARD = "**I couldn't find that in the document.**"

SYSTEM_PROMPT = """You are an intelligent AI document assistant answering questions strictly from the provided document context.

Core Directives:
- Ground your answers in the provided document context and attached document list. Synthesize facts smoothly and write in clean, professional Markdown.
- Strict Out-of-Document / Irrelevant Query Rule: If a question cannot be answered from the provided document context, is off-topic, or contains unclear/unrelated terms or gibberish not found in the documents, respond EXACTLY with:
**I couldn't find that in the document.**
Do NOT offer conversational small talk, do NOT say "I'm not sure what you're asking. Could you please clarify your question?", and do NOT apologize. Always output strictly and exactly:
**I couldn't find that in the document.**
- Cross-Document Queries: When asked how attached documents relate, compare, or which to study/read first, use the document titles, list of attached documents, and provided excerpts to summarize each document's role and explain how they connect or which sequence makes sense (e.g. foundational/overview chapters before operational/advanced topics). Do not refuse with "**I couldn't find that in the document.**" when attached document information and context are present.
- CRITICAL CITATION RULE: NEVER write chunk numbers, chunk IDs, page citations, or parenthetical references in your text (e.g. NEVER write '[Document.pdf - Page 1, Chunk 0]', '(From Document.pdf, Page 1, Chunk 0)', '[Chunk 0]', or '(Chunk 0)'). Source citations and document badges are automatically rendered by the user interface. Keep your response text completely clean, natural, and free of citation brackets.
- If conversation history is present, use it to resolve conversational references (e.g. "it", "that", "the second one") while grounding your answer in the retrieved context."""


def is_not_found_response(text: str) -> bool:
    """Detect if an LLM answer indicates the requested information was not found or is off-topic."""
    if not text:
        return True
    
    clean = text.strip()
    clean_lower = clean.lower()

    if clean == NOT_FOUND_STANDARD or clean_lower == "i couldn't find that in the document.":
        return True

    patterns = [
        r"couldn'?t\s+find\s+(?:that|this|any)\s+(?:in|from)\s+the\s+document",
        r"could\s+not\s+find\s+(?:that|this|any)\s+(?:in|from)\s+the\s+document",
        r"not\s+(?:found|mentioned|stated|specified|present)\s+in\s+the\s+document",
        r"(?:not\s+sure\s+what\s+you'?re\s+asking|please\s+clarify\s+your\s+question)",
        r"(?:the\s+provided\s+document|the\s+attached\s+document|the\s+document)\s+does\s+not\s+(?:contain|mention|provide|state|include)",
        r"there\s+is\s+no\s+(?:mention|information|reference)\s+(?:of|to|in)\s+.*the\s+document",
        r"i\s+cannot\s+find\s+.*in\s+the\s+document",
        r"i\s+can'?t\s+find\s+.*in\s+the\s+document",
    ]
    for p in patterns:
        if re.search(p, clean_lower, re.IGNORECASE):
            return True

    return False


def build_user_prompt(
    question: str,
    retrieved_chunks: list,
    active_docs: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Format the retrieved chunks + question cleanly with document manifest when multiple PDFs are active."""
    manifest_part = ""
    if active_docs and len(active_docs) > 1:
        doc_lines = [
            f"- Document {i+1}: {d.get('filename') or d.get('name')} ({d.get('pages_count') or d.get('pages', '—')} pages)"
            for i, d in enumerate(active_docs)
        ]
        manifest_part = (
            "Attached Documents in this Session:\n"
            + "\n".join(doc_lines)
            + "\n\n"
        )

    context_blocks = []
    for r in retrieved_chunks:
        doc = getattr(r.chunk, "doc_name", "")
        header = f"Excerpts from {doc} (Page {r.chunk.page})" if doc else f"Page {r.chunk.page}"
        context_blocks.append(f"--- {header} ---\n{r.chunk.text}")
    context = "\n\n".join(context_blocks)
    return f"{manifest_part}Document Context:\n\n{context}\n\nQuestion: {question}"


def clean_answer_text(text: str) -> str:
    """Remove any residual bracketed or parenthetical chunk/page citations generated by LLMs."""
    if not text:
        return ""
    # Strip e.g. [Paytm Challenge 2026.pdf - Page 1, Chunk 0] or (From Paytm Challenge 2026.pdf, Page 1, Chunk 0)
    cleaned = re.sub(
        r"\s*(\(|\[)\s*(?:from\s+)?[^()\[\]\n]*(?:chunk|\.pdf)[^()\[\]\n]*(\)|\])",
        "",
        text,
        flags=re.IGNORECASE,
    )
    # Strip e.g. [Chunk 0] or (Chunk 0) or [Page 1, Chunk 0]
    cleaned = re.sub(
        r"\s*(\(|\[)\s*(?:chunk\s*\d+|page\s*\d+)[^()\[\]\n]*(\)|\])",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


# ---------- Health & Sessions Endpoints ----------

@app.get("/health")
def health() -> dict:
    active_sid = store.get_active_session()
    sessions = db.get_all_sessions()
    chunks_indexed = store.size(active_sid) if active_sid else 0
    active_docs = db.get_session_documents(active_sid) if active_sid else []
    first_doc = active_docs[0]["filename"] if active_docs else None
    first_pages = active_docs[0]["pages_count"] if active_docs else 0

    return {
        "status": "ok",
        "total_sessions": len(sessions),
        "active_session_id": active_sid,
        "chunks_indexed": chunks_indexed,
        "filename": first_doc,
        "pages": first_pages,
        "active_documents": active_docs,
    }


# ---------- Authentication Endpoints ----------

@app.post("/auth/register", response_model=AuthResponse)
def register(req: RegisterRequest) -> AuthResponse:
    """Register a new user account, hash password with PBKDF2-HMAC-SHA256, and return 3-day JWT."""
    email = req.email.strip().lower()
    name = req.name.strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    existing = db.get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please sign in.")

    pw_hash = auth.hash_password(req.password)
    user = db.create_user(name=name, email=email, password_hash=pw_hash)
    token = auth.create_access_token(user_id=user["id"], email=user["email"], name=user["name"], expires_in_days=3)

    return AuthResponse(
        token=token,
        user=AuthUser(id=user["id"], name=user["name"], email=user["email"]),
    )


@app.post("/auth/login", response_model=AuthResponse)
def login(req: LoginRequest) -> AuthResponse:
    """Authenticate user with email and password, returning 3-day JWT."""
    email = req.email.strip().lower()
    user = db.get_user_by_email(email)
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = auth.create_access_token(user_id=user["id"], email=user["email"], name=user["name"], expires_in_days=3)
    return AuthResponse(
        token=token,
        user=AuthUser(id=user["id"], name=user["name"], email=user["email"]),
    )


@app.get("/auth/me", response_model=AuthUser)
def get_me(user: Dict[str, Any] = Depends(auth.require_current_user)) -> AuthUser:
    """Return authenticated user profile from JWT token."""
    return AuthUser(id=user["id"], name=user["name"], email=user["email"])


# ---------- Session Endpoints ----------

@app.get("/sessions")
def get_sessions(user: Optional[Dict[str, Any]] = Depends(auth.get_current_user)) -> List[Dict[str, Any]]:
    """Return all chat sessions ordered by last active descending."""
    user_id = user["id"] if user else None
    return db.get_all_sessions(user_id=user_id)


@app.post("/sessions")
def create_session(
    req: Optional[CreateSessionRequest] = None,
    user: Optional[Dict[str, Any]] = Depends(auth.get_current_user),
) -> Dict[str, Any]:
    """Create a new empty chat session."""
    title = req.title if req and req.title else "New Chat"
    user_id = user["id"] if user else None
    new_sess = db.create_session(title=title, user_id=user_id)
    store.set_active_session(new_sess["id"])
    return new_sess


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> Dict[str, Any]:
    """Get full details of a session: documents list and chat history."""
    sess = db.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    store.set_active_session(session_id)
    return sess


@app.patch("/sessions/{session_id}")
def update_session(session_id: str, req: UpdateSessionRequest) -> Dict[str, Any]:
    """Update a session's title."""
    ok = db.update_session_title(session_id, req.title)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "ok", "session_id": session_id, "title": req.title}


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str) -> Dict[str, Any]:
    """Delete a session, its documents, chunks, and message history."""
    db.delete_session(session_id)
    store.delete_session(session_id)
    return {"status": "ok", "deleted": session_id}


@app.delete("/sessions/{session_id}/messages")
def clear_session_messages(session_id: str) -> Dict[str, Any]:
    """Clear all conversation message history for a session from database."""
    db.clear_session_messages(session_id)
    return {"status": "ok", "cleared_session": session_id}


# ---------- Document Upload Endpoints ----------

@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
) -> UploadResponse:
    """Upload any supported document (PDF, PPTX, DOCX, TXT, MD, Images) and index into session."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing")

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats: PDF, PPTX, DOCX, TXT, MD, Images (PNG, JPG, JPEG, WEBP)",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pages = load_document(file_bytes, file.filename)
    if not pages:
        raise HTTPException(
            status_code=400,
            detail=f"Could not extract text from {file.filename}. Please verify the file is not empty or corrupted.",
        )

    # Establish target session
    if session_id:
        existing = db.get_session(session_id)
        if not existing:
            db.create_session(title=file.filename, session_id=session_id)
    else:
        # Create a new session titled with the first uploaded document name
        new_sess = db.create_session(title=file.filename)
        session_id = new_sess["id"]

    store.set_active_session(session_id)
    doc_id = uuid.uuid4().hex

    # Save original bytes with original extension
    db.save_upload_file(doc_id, file_bytes, filename=file.filename)

    # Chunk with document name metadata and incremental chunk indexing
    existing_chunks_count = store.size(session_id)
    chunks = chunk_pages(
        pages,
        doc_name=file.filename,
        doc_id=doc_id,
        start_chunk_id=existing_chunks_count,
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks produced")

    vectors = embed_texts([c.text for c in chunks])

    # Persist in SQLite and add to in-memory session index
    db.save_document_and_chunks(
        session_id=session_id,
        doc_id=doc_id,
        filename=file.filename,
        pages_count=len(pages),
        chunks=chunks,
        embeddings=vectors,
    )
    store.add(vectors, chunks, session_id=session_id)

    total_chunks = store.size(session_id)
    docs_in_sess = db.get_session_documents(session_id)

    return UploadResponse(
        filename=file.filename,
        chunks_indexed=len(chunks),
        pages_processed=len(pages),
        session_id=session_id,
        total_session_docs=len(docs_in_sess),
        total_session_chunks=total_chunks,
        doc_id=doc_id,
    )


@app.post("/upload/batch", response_model=BatchUploadResponse)
async def upload_pdf_batch(
    files: List[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
) -> BatchUploadResponse:
    """Upload multiple documents (PDF, PPTX, DOCX, TXT, MD, Images) in a single batch request and index into session."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    valid_files = [f for f in files if f.filename and Path(f.filename).suffix.lower() in SUPPORTED_EXTENSIONS]
    if not valid_files:
        raise HTTPException(
            status_code=400,
            detail="No supported files found in upload. Supported: PDF, PPTX, DOCX, TXT, MD, Images (PNG, JPG)",
        )

    # Establish target session
    if session_id:
        existing = db.get_session(session_id)
        if not existing:
            first_name = valid_files[0].filename or "Chat"
            db.create_session(title=first_name, session_id=session_id)
    else:
        title = valid_files[0].filename if len(valid_files) == 1 else f"Batch ({len(valid_files)} Docs)"
        new_sess = db.create_session(title=title)
        session_id = new_sess["id"]

    store.set_active_session(session_id)

    total_chunks_indexed = 0
    total_pages_processed = 0
    processed_docs: List[BatchUploadItem] = []

    for f in valid_files:
        file_bytes = await f.read()
        if not file_bytes:
            continue

        pages = load_document(file_bytes, f.filename)
        if not pages:
            continue

        doc_id = uuid.uuid4().hex
        db.save_upload_file(doc_id, file_bytes, filename=f.filename)

        existing_chunks_count = store.size(session_id)
        chunks = chunk_pages(
            pages,
            doc_name=f.filename,
            doc_id=doc_id,
            start_chunk_id=existing_chunks_count,
        )
        if not chunks:
            continue

        vectors = embed_texts([c.text for c in chunks])
        db.save_document_and_chunks(
            session_id=session_id,
            doc_id=doc_id,
            filename=f.filename,
            pages_count=len(pages),
            chunks=chunks,
            embeddings=vectors,
        )
        store.add(vectors, chunks, session_id=session_id)

        total_chunks_indexed += len(chunks)
        total_pages_processed += len(pages)
        processed_docs.append(
            BatchUploadItem(
                doc_id=doc_id,
                filename=f.filename,
                pages=len(pages),
                chunks=len(chunks),
            )
        )

    if not processed_docs:
        raise HTTPException(status_code=400, detail="Could not extract text from any uploaded document")

    total_chunks = store.size(session_id)
    docs_in_sess = db.get_session_documents(session_id)

    return BatchUploadResponse(
        session_id=session_id,
        total_files_uploaded=len(processed_docs),
        total_chunks_indexed=total_chunks_indexed,
        total_pages_processed=total_pages_processed,
        documents=processed_docs,
        total_session_docs=len(docs_in_sess),
        total_session_chunks=total_chunks,
    )


@app.post("/upload/text", response_model=UploadResponse)
def upload_text_notes(req: TextUploadRequest) -> UploadResponse:
    """Ingest raw pasted text/notes into the session as a searchable document."""
    title = (req.title or "Pasted Notes").strip()
    if not title:
        title = "Pasted Notes"
    display_filename = title if any(title.lower().endswith(ext) for ext in [".txt", ".md"]) else f"{title}.txt"

    pages = load_raw_text(req.text)
    if not pages:
        raise HTTPException(status_code=400, detail="Pasted text cannot be empty")

    session_id = req.session_id
    if session_id:
        existing = db.get_session(session_id)
        if not existing:
            db.create_session(title=display_filename, session_id=session_id)
    else:
        new_sess = db.create_session(title=display_filename)
        session_id = new_sess["id"]

    store.set_active_session(session_id)
    doc_id = uuid.uuid4().hex

    # Save as text file in uploads directory
    db.save_upload_file(doc_id, req.text.encode("utf-8"), filename=display_filename)

    existing_chunks_count = store.size(session_id)
    chunks = chunk_pages(
        pages,
        doc_name=display_filename,
        doc_id=doc_id,
        start_chunk_id=existing_chunks_count,
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks produced from text")

    vectors = embed_texts([c.text for c in chunks])
    db.save_document_and_chunks(
        session_id=session_id,
        doc_id=doc_id,
        filename=display_filename,
        pages_count=len(pages),
        chunks=chunks,
        embeddings=vectors,
    )
    store.add(vectors, chunks, session_id=session_id)

    total_chunks = store.size(session_id)
    docs_in_sess = db.get_session_documents(session_id)

    return UploadResponse(
        filename=display_filename,
        chunks_indexed=len(chunks),
        pages_processed=len(pages),
        session_id=session_id,
        total_session_docs=len(docs_in_sess),
        total_session_chunks=total_chunks,
        doc_id=doc_id,
    )


@app.delete("/sessions/{session_id}/documents/{doc_id}")
def delete_session_document(session_id: str, doc_id: str) -> Dict[str, Any]:
    """Delete an individual document and its chunks from a session, then rehydrate the vector store."""
    deleted = db.delete_document(session_id, doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")

    store.rehydrate_session(session_id)
    remaining_docs = db.get_session_documents(session_id)
    return {
        "status": "ok",
        "deleted_doc_id": doc_id,
        "session_id": session_id,
        "remaining_docs": len(remaining_docs),
        "remaining_chunks": store.size(session_id),
    }


# ---------- PDF Document & Page Viewer Endpoints ----------

@app.get("/documents/{doc_id}/page/{page_num}")
def get_document_page_image(doc_id: str, page_num: int) -> Response:
    """Render a specific document page or image (1-indexed) as a PNG image for visual preview."""
    file_path = db.get_upload_file_path(doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Document file not found on server")

    ext = file_path.suffix.lower()

    # Image formats (.png, .jpg, .jpeg, .webp, .bmp, etc.)
    if ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]:
        try:
            from PIL import Image
            import io
            img = Image.open(str(file_path)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return Response(content=buf.getvalue(), media_type="image/png")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load image: {e}")

    # PDF documents
    if ext == ".pdf":
        try:
            import io
            import pypdfium2
            pdf = pypdfium2.PdfDocument(str(file_path))
            if page_num < 1 or page_num > len(pdf):
                raise HTTPException(status_code=400, detail=f"Page {page_num} out of bounds (1-{len(pdf)})")

            page = pdf[page_num - 1]
            # scale=1.5 gives crisp 108 DPI rendering with small file size (~100-200KB)
            bmp = page.render(scale=1.5)
            pil_image = bmp.to_pil()
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            pdf.close()
            return Response(content=buf.getvalue(), media_type="image/png")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to render page image: {e}")

    raise HTTPException(
        status_code=400,
        detail="Visual page preview is available for PDF and image documents. Please see the Text Excerpt tab.",
    )


@app.get("/documents/{doc_id}/file")
def get_document_file(doc_id: str) -> FileResponse:
    """Download or view the raw document file."""
    file_path = db.get_upload_file_path(doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Document file not found")
    doc_info = db.get_document(doc_id)
    filename = doc_info["filename"] if doc_info else file_path.name

    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    return FileResponse(
        str(file_path),
        media_type=mime_type,
        filename=filename,
    )


# ---------- Query Endpoints ----------

def _get_history_messages(session_id: str) -> List[Dict[str, str]]:
    """Fetch conversation memory from SQLite (last N turns)."""
    raw_msgs = db.get_session_messages(session_id, limit=MAX_HISTORY_TURNS * 2)
    return [{"role": m["role"], "content": m["content"]} for m in raw_msgs]


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    """Non-streaming query answering across all documents in the session."""
    start_time = time.perf_counter()
    session_id = req.session_id or store.get_active_session()
    if not session_id or store.size(session_id) == 0:
        raise HTTPException(
            status_code=400,
            detail="No document indexed. POST a PDF to /upload first.",
        )

    store.set_active_session(session_id)

    active_docs = db.get_session_documents(session_id)
    doc_names = [d.get("filename") or d.get("name", "") for d in active_docs] if active_docs else []
    resolved_query = resolve_query_doc_references(req.question, doc_names) if len(doc_names) > 1 else req.question

    query_vec = embed_texts([resolved_query])[0]
    fetch_k = max(req.top_k * 3, 10)
    candidates = store.search(
        query_vec,
        top_k=fetch_k,
        query_text=resolved_query,
        session_id=session_id,
    )
    retrieved = rerank(req.question, candidates, top_k=req.top_k)

    if not retrieved:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        db.save_message(session_id, "user", req.question)
        db.save_message(session_id, "assistant", NOT_FOUND_STANDARD, sources=[], latency_ms=latency_ms)
        return QueryResponse(
            answer=NOT_FOUND_STANDARD,
            sources=[],
            session_id=session_id,
            latency_ms=latency_ms,
        )

    sources = [
        Source(
            chunk_id=r.chunk.chunk_id,
            text=r.chunk.text,
            page=r.chunk.page,
            score=round(r.score, 4),
            doc_name=getattr(r.chunk, "doc_name", "Document"),
            doc_id=getattr(r.chunk, "doc_id", ""),
        )
        for r in retrieved
    ]

    llm = get_llm_client()
    user_prompt = build_user_prompt(req.question, retrieved, active_docs=active_docs)

    # Build multi-turn context (only if session_id explicitly passed to avoid inter-test pollution)
    history = _get_history_messages(req.session_id) if req.session_id else []
    messages = history + [{"role": "user", "content": user_prompt}]

    answer = llm.generate(system=SYSTEM_PROMPT, messages=messages).strip()
    answer = unicodedata.normalize("NFKC", answer)
    answer = clean_answer_text(answer)

    # If the LLM answer is an out-of-document refusal or missing fact, enforce strict bold answer & zero sources
    if is_not_found_response(answer):
        answer = NOT_FOUND_STANDARD
        sources = []

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Save turns to SQLite
    db.save_message(session_id, "user", req.question)
    db.save_message(
        session_id,
        "assistant",
        answer,
        sources=[s.model_dump() for s in sources],
        latency_ms=latency_ms,
    )

    return QueryResponse(answer=answer, sources=sources, session_id=session_id, latency_ms=latency_ms)


@app.post("/query/stream")
def query_stream(req: QueryRequest) -> StreamingResponse:
    """Streaming query answering across all documents in the session with live status events."""
    start_time = time.perf_counter()
    session_id = req.session_id or store.get_active_session()
    if not session_id or store.size(session_id) == 0:
        raise HTTPException(
            status_code=400,
            detail="No document indexed. POST a PDF to /upload first.",
        )

    store.set_active_session(session_id)

    def event_stream() -> Iterator[str]:
        # 1. Live status: Searching index
        yield f"data: {json.dumps({'status': 'Searching document index...'})}\n\n"

        active_docs = db.get_session_documents(session_id)
        doc_names = [d.get("filename") or d.get("name", "") for d in active_docs] if active_docs else []
        resolved_query = resolve_query_doc_references(req.question, doc_names) if len(doc_names) > 1 else req.question

        query_vec = embed_texts([resolved_query])[0]
        fetch_k = max(req.top_k * 3, 10)
        candidates = store.search(
            query_vec,
            top_k=fetch_k,
            query_text=resolved_query,
            session_id=session_id,
        )

        # 2. Live status: Cross-Encoder reranking
        yield f"data: {json.dumps({'status': 'Analyzing excerpts with Cross-Encoder...'})}\n\n"
        retrieved = rerank(req.question, candidates, top_k=req.top_k)

        if not retrieved:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            db.save_message(session_id, "user", req.question)
            db.save_message(session_id, "assistant", NOT_FOUND_STANDARD, sources=[], latency_ms=latency_ms)
            yield f"data: {json.dumps({'token': NOT_FOUND_STANDARD})}\n\n"
            yield f"data: {json.dumps({'sources': [], 'session_id': session_id, 'latency_ms': latency_ms, 'final_answer': NOT_FOUND_STANDARD})}\n\n"
            return

        sources = [
            {
                "chunk_id": r.chunk.chunk_id,
                "text": r.chunk.text,
                "page": r.chunk.page,
                "score": round(r.score, 4),
                "doc_name": getattr(r.chunk, "doc_name", "Document"),
                "doc_id": getattr(r.chunk, "doc_id", ""),
            }
            for r in retrieved
        ]

        # 3. Live status: Synthesizing answer
        yield f"data: {json.dumps({'status': 'Generating grounded response...'})}\n\n"

        llm = get_llm_client()
        user_prompt = build_user_prompt(req.question, retrieved, active_docs=active_docs)
        history = _get_history_messages(req.session_id) if req.session_id else []
        messages = history + [{"role": "user", "content": user_prompt}]

        tokens: List[str] = []
        for token in llm.stream(system=SYSTEM_PROMPT, messages=messages):
            tokens.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        full_answer = unicodedata.normalize("NFKC", "".join(tokens))
        full_answer = clean_answer_text(full_answer)

        # If answer is not found or off-topic, enforce strict bold answer & zero sources
        if is_not_found_response(full_answer):
            full_answer = NOT_FOUND_STANDARD
            sources = []

        latency_ms = int((time.perf_counter() - start_time) * 1000)

        # Save turns to SQLite message history
        db.save_message(session_id, "user", req.question)
        db.save_message(session_id, "assistant", full_answer, sources=sources, latency_ms=latency_ms)

        yield f"data: {json.dumps({'sources': sources, 'session_id': session_id, 'latency_ms': latency_ms, 'final_answer': full_answer})}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream; charset=utf-8",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)
