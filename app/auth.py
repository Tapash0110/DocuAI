"""Authentication module for DocuAI.

Provides:
- OWASP PBKDF2-HMAC-SHA256 password hashing (built-in Python standard library, zero external dependency)
- RFC 7519 HS256 JSON Web Token (JWT) generation and verification with 3-day expiry
- FastAPI authentication dependencies
"""
import base64
import hmac
import hashlib
import json
import os
import secrets
import time
from typing import Any, Dict, Optional
from fastapi import Header, HTTPException, status

from app import db

SECRET_KEY = os.environ.get("DOCUAI_SECRET_KEY", "docuai-super-secret-production-jwt-key-2026")
JWT_EXPIRY_DAYS = 3


def b64url_encode(data: bytes) -> str:
    """Encode bytes to URL-safe base64 without trailing padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(data: str) -> bytes:
    """Decode URL-safe base64 string with auto-padding."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with 100,000 rounds and a random 16-byte salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored salt:hash string."""
    try:
        salt, key_hex = stored_hash.split(":")
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False


def create_access_token(
    user_id: str,
    email: str,
    name: str,
    expires_in_days: int = JWT_EXPIRY_DAYS,
) -> str:
    """Create a signed HS256 JWT valid for `expires_in_days` days."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + (expires_in_days * 86400),
    }

    hdr_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    pay_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{hdr_b64}.{pay_b64}".encode("ascii")

    signature = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = b64url_encode(signature)

    return f"{hdr_b64}.{pay_b64}.{sig_b64}"


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and verify a signed HS256 JWT. Raises ValueError if invalid or expired."""
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT token structure")

    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected_signature = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_signature = b64url_decode(parts[2])

    if not hmac.compare_digest(expected_signature, actual_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(b64url_decode(parts[1]).decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise ValueError("Token has expired")

    return payload


def get_token_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract raw bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.strip().split(" ")
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return parts[0] if len(parts) == 1 else None


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """FastAPI dependency: Returns user dictionary if valid token provided, else None."""
    token = get_token_from_header(authorization)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.get_user_by_id(user_id)
        if user:
            return {"id": user["id"], "name": user["name"], "email": user["email"]}
        return None
    except Exception:
        return None


def require_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """FastAPI dependency: Requires valid token or raises HTTP 401."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
