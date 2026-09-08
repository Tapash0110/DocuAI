"""SQLite persistence layer for DocuAI.

Stores:
- Chat sessions
- Document metadata
- Chunks and precomputed embedding BLOBs (for instant startup/rehydration)
- Conversation message history with citations
"""
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_db_path() -> Path:
    env_path = os.environ.get("DOCUAI_DB_PATH")
    if env_path:
        return Path(env_path)
    return PROJECT_ROOT / "data" / "docuai.db"


def _get_connection() -> sqlite3.Connection:
    """Ensure data directory exists and return SQLite connection with row factory."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Initialize database tables if they do not exist."""
    with _get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                pages_count INTEGER NOT NULL,
                chunks_count INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                doc_name TEXT NOT NULL,
                page INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id);
            CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            """
        )
        # Ensure latency_ms column exists in messages table
        try:
            conn.execute("ALTER TABLE messages ADD COLUMN latency_ms INTEGER")
        except sqlite3.OperationalError:
            pass

        # Ensure user_id column exists in sessions table
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
        except sqlite3.OperationalError:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- User Operations ----------

def create_user(name: str, email: str, password_hash: str) -> Dict[str, Any]:
    """Create a new user record in SQLite."""
    init_db()
    uid = uuid.uuid4().hex
    now = _now_iso()
    normalized_email = email.strip().lower()
    with _get_connection() as conn:
        conn.execute(
            "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (uid, name.strip(), normalized_email, password_hash, now),
        )
    return {"id": uid, "name": name.strip(), "email": normalized_email, "created_at": now}


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve user record by email."""
    init_db()
    normalized_email = email.strip().lower()
    with _get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve user record by ID."""
    init_db()
    with _get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, email, password_hash, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


# ---------- Session Operations ----------

def get_all_sessions(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return all sessions ordered by updated_at descending with document and message counts."""
    init_db()
    with _get_connection() as conn:
        if user_id:
            query = """
            SELECT 
                s.id,
                s.title,
                s.created_at,
                s.updated_at,
                s.user_id,
                COUNT(DISTINCT d.id) AS doc_count,
                COUNT(DISTINCT m.id) AS message_count
            FROM sessions s
            LEFT JOIN documents d ON s.id = d.session_id
            LEFT JOIN messages m ON s.id = m.session_id
            WHERE s.user_id = ? OR s.user_id IS NULL
            GROUP BY s.id
            HAVING doc_count > 0 OR message_count > 0
            ORDER BY s.updated_at DESC
            """
            cursor = conn.execute(query, (user_id,))
        else:
            query = """
            SELECT 
                s.id,
                s.title,
                s.created_at,
                s.updated_at,
                s.user_id,
                COUNT(DISTINCT d.id) AS doc_count,
                COUNT(DISTINCT m.id) AS message_count
            FROM sessions s
            LEFT JOIN documents d ON s.id = d.session_id
            LEFT JOIN messages m ON s.id = m.session_id
            GROUP BY s.id
            HAVING doc_count > 0 OR message_count > 0
            ORDER BY s.updated_at DESC
            """
            cursor = conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Return session metadata, its attached documents, and message history."""
    init_db()
    with _get_connection() as conn:
        s_row = conn.execute(
            "SELECT id, title, created_at, updated_at, user_id FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not s_row:
            return None

        session_dict = dict(s_row)

        d_rows = conn.execute(
            "SELECT id, session_id, filename, pages_count, chunks_count, created_at FROM documents WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
        session_dict["documents"] = [dict(r) for r in d_rows]

        m_rows = conn.execute(
            "SELECT id, session_id, role, content, sources, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        ).fetchall()
        messages = []
        for r in m_rows:
            m = dict(r)
            m["sources"] = json.loads(m["sources"]) if m.get("sources") else []
            messages.append(m)
        session_dict["messages"] = messages

        return session_dict


def create_session(title: str = "New Chat", session_id: Optional[str] = None, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a new chat session."""
    init_db()
    sid = session_id or uuid.uuid4().hex
    now = _now_iso()
    with _get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?)",
            (sid, title, now, now, user_id),
        )
    return {"id": sid, "title": title, "created_at": now, "updated_at": now, "user_id": user_id, "documents": [], "messages": []}


def update_session_title(session_id: str, title: str) -> bool:
    """Update a session's title."""
    init_db()
    now = _now_iso()
    with _get_connection() as conn:
        cur = conn.execute(
            "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
            (title, now, session_id),
        )
        return cur.rowcount > 0


def touch_session(session_id: str) -> None:
    """Update updated_at timestamp on a session."""
    init_db()
    now = _now_iso()
    with _get_connection() as conn:
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )


def delete_session(session_id: str) -> bool:
    """Delete a session and all its associated documents, chunks, and messages."""
    init_db()
    with _get_connection() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cur.rowcount > 0


def get_latest_session_id() -> Optional[str]:
    """Return the most recently updated session_id."""
    init_db()
    with _get_connection() as conn:
        row = conn.execute("SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1").fetchone()
        return row["id"] if row else None


# ---------- Document & Chunk Operations ----------

def save_document_and_chunks(
    session_id: str,
    doc_id: str,
    filename: str,
    pages_count: int,
    chunks: List[Any],  # List[Chunk]
    embeddings: np.ndarray,
) -> None:
    """Save document metadata and all chunk texts with embedding BLOBs."""
    init_db()
    now = _now_iso()
    with _get_connection() as conn:
        # Check if session exists, create if not
        s_row = conn.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s_row:
            conn.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (session_id, filename, now, now),
            )
        else:
            conn.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id),
            )

        # Save document
        conn.execute(
            "INSERT INTO documents (id, session_id, filename, pages_count, chunks_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, session_id, filename, pages_count, len(chunks), now),
        )

        # Bulk insert chunks
        chunk_rows = []
        for i, chunk in enumerate(chunks):
            vec_bytes = embeddings[i].tobytes()
            chunk_rows.append(
                (
                    session_id,
                    doc_id,
                    getattr(chunk, "doc_name", filename),
                    chunk.page,
                    chunk.chunk_id,
                    chunk.text,
                    vec_bytes,
                )
            )

        conn.executemany(
            """
            INSERT INTO chunks (session_id, doc_id, doc_name, page, chunk_index, text, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            chunk_rows,
        )


def get_session_chunks(session_id: str) -> List[Dict[str, Any]]:
    """Retrieve all chunks and embedding vectors for a session."""
    init_db()
    with _get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, session_id, doc_id, doc_name, page, chunk_index, text, embedding
            FROM chunks
            WHERE session_id = ?
            ORDER BY id ASC
            """,
            (session_id,),
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            vec = np.frombuffer(r["embedding"], dtype=np.float32)
            result.append(
                {
                    "id": r["id"],
                    "session_id": r["session_id"],
                    "doc_id": r["doc_id"],
                    "doc_name": r["doc_name"],
                    "page": r["page"],
                    "chunk_id": r["chunk_index"],
                    "text": r["text"],
                    "embedding": vec,
                }
            )
        return result


def get_uploads_dir() -> Path:
    """Directory where uploaded PDF files are stored for viewing/page rendering."""
    uploads_dir = PROJECT_ROOT / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    return uploads_dir


def save_upload_file(doc_id: str, file_bytes: bytes, filename: Optional[str] = None) -> Path:
    """Save raw document file to data/uploads/{doc_id}{ext}."""
    ext = Path(filename).suffix.lower() if filename else ".pdf"
    if not ext:
        ext = ".pdf"
    target_path = get_uploads_dir() / f"{doc_id}{ext}"
    with open(target_path, "wb") as f:
        f.write(file_bytes)
    return target_path


def get_upload_file_path(doc_id: str) -> Optional[Path]:
    """Return path to saved document if it exists on disk."""
    uploads_dir = get_uploads_dir()
    pdf_path = uploads_dir / f"{doc_id}.pdf"
    if pdf_path.exists():
        return pdf_path
    matches = list(uploads_dir.glob(f"{doc_id}.*"))
    if matches:
        return matches[0]
    return None


def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve document metadata by doc_id."""
    init_db()
    with _get_connection() as conn:
        row = conn.execute(
            "SELECT id, session_id, filename, pages_count, chunks_count, created_at FROM documents WHERE id = ?",
            (doc_id,),
        ).fetchone()
        return dict(row) if row else None


def delete_document(session_id: str, doc_id: str) -> bool:
    """Delete a specific document and its associated chunks from a session."""
    init_db()
    now = _now_iso()
    with _get_connection() as conn:
        # Delete document row
        cur = conn.execute(
            "DELETE FROM documents WHERE session_id = ? AND id = ?",
            (session_id, doc_id),
        )
        deleted = cur.rowcount > 0

        # Delete associated chunks
        conn.execute(
            "DELETE FROM chunks WHERE session_id = ? AND doc_id = ?",
            (session_id, doc_id),
        )

        # Update session timestamp
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )

    # Clean up physical file on disk if present
    file_path = get_upload_file_path(doc_id)
    if file_path and file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    return deleted


def get_session_documents(session_id: str) -> List[Dict[str, Any]]:
    """Retrieve list of documents for a session."""
    init_db()
    with _get_connection() as conn:
        rows = conn.execute(
            "SELECT id, session_id, filename, pages_count, chunks_count, created_at FROM documents WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]


# ---------- Message Operations ----------

def save_message(
    session_id: str,
    role: str,
    content: str,
    sources: Optional[List[Dict[str, Any]]] = None,
    latency_ms: Optional[int] = None,
) -> Dict[str, Any]:
    """Append a message to the session history and update session updated_at."""
    init_db()
    now = _now_iso()
    sources_json = json.dumps(sources) if sources else None
    with _get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO messages (session_id, role, content, sources, created_at, latency_ms) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, role, content, sources_json, now, latency_ms),
        )
        conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
        msg_id = cur.lastrowid
        return {
            "id": msg_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "sources": sources or [],
            "created_at": now,
            "latency_ms": latency_ms,
        }


def get_session_messages(session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retrieve recent messages for a session."""
    init_db()
    with _get_connection() as conn:
        query = "SELECT id, session_id, role, content, sources, created_at, latency_ms FROM messages WHERE session_id = ? ORDER BY id ASC"
        rows = conn.execute(query, (session_id,)).fetchall()
        msgs = []
        for r in rows:
            m = dict(r)
            m["sources"] = json.loads(m["sources"]) if m.get("sources") else []
            msgs.append(m)
        if limit and len(msgs) > limit:
            return msgs[-limit:]
        return msgs


def clear_session_messages(session_id: str) -> None:
    """Clear all chat messages for a session from the database."""
    init_db()
    with _get_connection() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        now = _now_iso()
        conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))

