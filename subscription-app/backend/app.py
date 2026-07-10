from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "subscription_app.db"
EXAMS_INDEX_PATH = PROJECT_ROOT / "docs" / "assets" / "json" / "exams-index.json"
EXAMS_ROOT = PROJECT_ROOT / "docs" / "assets" / "json"
SESSION_TTL_DAYS = 30
PASSWORD_ITERATIONS = 120_000
APP_SECRET = os.getenv("EXAM_ASSISTANT_SECRET", "change-me-in-production")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

DATA_DIR.mkdir(parents=True, exist_ok=True)

FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Exam Assistant Subscription API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    plan: str = Field(default="free", pattern="^(free|pro|premium)$")


class SaveProgressRequest(BaseModel):
    exam_uid: str = Field(min_length=1, max_length=300)
    exam_title: str = Field(min_length=1, max_length=300)
    subject: str = Field(min_length=1, max_length=300)
    answers: Dict[str, Any]
    score: Optional[float] = None
    completed_at: Optional[str] = None


class FavoriteExamRequest(BaseModel):
    exam_uid: str = Field(min_length=1, max_length=300)
    exam_title: str = Field(min_length=1, max_length=300)
    subject: str = Field(min_length=1, max_length=300)
    partial: Optional[str] = Field(default=None, max_length=120)
    file: Optional[str] = Field(default=None, max_length=500)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    return email


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                plan TEXT NOT NULL DEFAULT 'free',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS exam_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                exam_uid TEXT NOT NULL,
                exam_title TEXT NOT NULL,
                subject TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                score REAL,
                completed_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS favorite_exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                exam_uid TEXT NOT NULL,
                exam_title TEXT NOT NULL,
                subject TEXT NOT NULL,
                partial TEXT,
                file TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, exam_uid)
            );
            """
        )


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PASSWORD_ITERATIONS,
    ).hex()


def make_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    return hash_password(password, salt), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    calculated = hash_password(password, salt)
    return hmac.compare_digest(calculated, password_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(f"{APP_SECRET}:{token}".encode("utf-8")).hexdigest()


def issue_session(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = utc_now()
    expires = now + timedelta(days=SESSION_TTL_DAYS)
    conn.execute(
        "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user_id, hash_token(token), now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    return token


def get_token_value(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return authorization[len(prefix):].strip()


def get_current_user(authorization: Optional[str]) -> sqlite3.Row:
    token = get_token_value(authorization)
    token_digest = hash_token(token)
    now_iso = utc_now().isoformat()

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            ORDER BY s.id DESC
            LIMIT 1
            """,
            (token_digest, now_iso),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return row


def serialize_user(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "plan": row["plan"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def load_catalog() -> Dict[str, Any]:
    if not EXAMS_INDEX_PATH.exists():
        return {"generatedAt": None, "count": 0, "defaultExamUid": None, "items": []}
    with EXAMS_INDEX_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_exam_by_uid(exam_uid: str) -> Dict[str, Any]:
    catalog = load_catalog()
    items = catalog.get("items", []) if isinstance(catalog, dict) else []
    for item in items:
        if item.get("examUid") == exam_uid:
            relative_file = item.get("file")
            if not relative_file:
                break
            exam_path = PROJECT_ROOT / "docs" / relative_file
            if not exam_path.exists():
                break
            with exam_path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
    raise HTTPException(status_code=404, detail="Exam not found")


def get_catalog_item(exam_uid: str) -> Optional[Dict[str, Any]]:
    catalog = load_catalog()
    items = catalog.get("items", []) if isinstance(catalog, dict) else []
    for item in items:
        if item.get("examUid") == exam_uid:
            return item
    return None


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/subscription/index.html")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterRequest) -> Dict[str, Any]:
    now = utc_now().isoformat()
    email = normalize_email(payload.email)
    password_hash, password_salt = make_password(payload.password)

    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        cursor = conn.execute(
            """
            INSERT INTO users (email, name, password_hash, password_salt, plan, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'free', ?, ?)
            """,
            (email, payload.name.strip(), password_hash, password_salt, now, now),
        )
        conn.commit()
        user_id = cursor.lastrowid
        if user_id is None:
            raise HTTPException(status_code=500, detail="Failed to create user")
        token = issue_session(conn, int(user_id))
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return {"token": token, "user": serialize_user(user)}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> Dict[str, Any]:
    email = normalize_email(payload.email)
    with get_connection() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not verify_password(payload.password, user["password_hash"], user["password_salt"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = issue_session(conn, int(user["id"]))

    return {"token": token, "user": serialize_user(user)}


@app.get("/api/auth/me")
def me(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    return {"user": serialize_user(user)}


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    token = get_token_value(authorization)
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
        conn.commit()
    return {"success": True}


@app.put("/api/account/profile")
def update_profile(payload: UpdateProfileRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    now = utc_now().isoformat()
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET name = ?, plan = ?, updated_at = ? WHERE id = ?",
            (payload.name.strip(), payload.plan, now, user["id"]),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"user": serialize_user(updated)}


@app.get("/api/catalog")
def catalog(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    get_current_user(authorization)
    return load_catalog()


@app.get("/api/exams/{exam_uid:path}")
def get_exam(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    get_current_user(authorization)
    return {"exam": load_exam_by_uid(exam_uid)}


@app.get("/api/exam")
def get_exam_by_query(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    get_current_user(authorization)
    return {"exam": load_exam_by_uid(exam_uid)}


@app.get("/api/account/progress")
def get_progress(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT exam_uid, exam_title, subject, score, completed_at, updated_at
            FROM exam_attempts
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return {
        "items": [
            {
                "examUid": row["exam_uid"],
                "examTitle": row["exam_title"],
                "subject": row["subject"],
                "score": row["score"],
                "completedAt": row["completed_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]
    }


@app.get("/api/account/progress/{exam_uid:path}")
def get_progress_detail(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT exam_uid, exam_title, subject, answers_json, score, completed_at, updated_at
            FROM exam_attempts
            WHERE user_id = ? AND exam_uid = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (user["id"], exam_uid),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Saved progress not found")

    catalog_item = get_catalog_item(exam_uid) or {}
    answers = json.loads(row["answers_json"] or "{}")
    return {
        "item": {
            "examUid": row["exam_uid"],
            "examTitle": row["exam_title"],
            "subject": row["subject"],
            "partial": catalog_item.get("partial") or None,
            "file": catalog_item.get("file") or None,
            "answers": answers,
            "score": row["score"],
            "completedAt": row["completed_at"],
            "updatedAt": row["updated_at"],
        }
    }


@app.get("/api/account/progress-detail")
def get_progress_detail_by_query(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    return get_progress_detail(exam_uid, authorization)


@app.post("/api/account/progress")
def save_progress(payload: SaveProgressRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    user = get_current_user(authorization)
    now = utc_now().isoformat()
    completed_at = payload.completed_at or now
    answers_json = json.dumps(payload.answers, ensure_ascii=False)

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM exam_attempts WHERE user_id = ? AND exam_uid = ?",
            (user["id"], payload.exam_uid),
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE exam_attempts
                SET exam_title = ?, subject = ?, answers_json = ?, score = ?, completed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.exam_title,
                    payload.subject,
                    answers_json,
                    payload.score,
                    completed_at,
                    now,
                    existing["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO exam_attempts (
                    user_id, exam_uid, exam_title, subject, answers_json, score, completed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    payload.exam_uid,
                    payload.exam_title,
                    payload.subject,
                    answers_json,
                    payload.score,
                    completed_at,
                    now,
                    now,
                ),
            )
        conn.commit()

    return {"success": True}


@app.delete("/api/account/progress/{exam_uid:path}")
def delete_progress(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    user = get_current_user(authorization)
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM exam_attempts WHERE user_id = ? AND exam_uid = ?",
            (user["id"], exam_uid),
        )
        conn.commit()
    return {"success": True}


@app.delete("/api/account/progress")
def delete_progress_by_query(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    return delete_progress(exam_uid, authorization)


@app.get("/api/account/favorites")
def get_favorites(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT exam_uid, exam_title, subject, partial, file, created_at, updated_at
            FROM favorite_exams
            WHERE user_id = ?
            ORDER BY subject COLLATE NOCASE ASC, partial COLLATE NOCASE ASC, exam_title COLLATE NOCASE ASC
            """,
            (user["id"],),
        ).fetchall()

    return {
        "items": [
            {
                "examUid": row["exam_uid"],
                "examTitle": row["exam_title"],
                "subject": row["subject"],
                "partial": row["partial"],
                "file": row["file"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]
    }


@app.post("/api/account/favorites")
def save_favorite(payload: FavoriteExamRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    user = get_current_user(authorization)
    now = utc_now().isoformat()

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM favorite_exams WHERE user_id = ? AND exam_uid = ?",
            (user["id"], payload.exam_uid),
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE favorite_exams
                SET exam_title = ?, subject = ?, partial = ?, file = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.exam_title,
                    payload.subject,
                    payload.partial,
                    payload.file,
                    now,
                    existing["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO favorite_exams (user_id, exam_uid, exam_title, subject, partial, file, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    payload.exam_uid,
                    payload.exam_title,
                    payload.subject,
                    payload.partial,
                    payload.file,
                    now,
                    now,
                ),
            )
        conn.commit()

    return {"success": True}


@app.delete("/api/account/favorites/{exam_uid:path}")
def delete_favorite(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    user = get_current_user(authorization)
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM favorite_exams WHERE user_id = ? AND exam_uid = ?",
            (user["id"], exam_uid),
        )
        conn.commit()
    return {"success": True}


@app.delete("/api/account/favorite")
def delete_favorite_by_query(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    return delete_favorite(exam_uid, authorization)


app.mount("/subscription", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="subscription")
app.mount("/docs", StaticFiles(directory=str(PROJECT_ROOT / "docs"), html=True), name="docs")
