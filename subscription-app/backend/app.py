from __future__ import annotations

import hashlib
import hmac
import importlib
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
DATABASE_URL_RAW = os.getenv("DATABASE_URL", "").strip()
EXAMS_INDEX_PATH = PROJECT_ROOT / "docs" / "assets" / "json" / "exams-index.json"
EXAMS_ROOT = PROJECT_ROOT / "docs" / "assets" / "json"
SESSION_TTL_DAYS = 30
PASSWORD_ITERATIONS = 120_000
APP_SECRET = os.getenv("EXAM_ASSISTANT_SECRET", "change-me-in-production")
ADMIN_EMAIL = os.getenv("SUBSCRIPTION_ADMIN_EMAIL", "admin@exam-assistant.local")
ADMIN_PASSWORD = os.getenv("SUBSCRIPTION_ADMIN_PASSWORD", "Admin123456")
ADMIN_NAME = os.getenv("SUBSCRIPTION_ADMIN_NAME", "Administrador")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PLAN_ORDER = {"free": 0, "pro": 1, "premium": 2}
VALID_PLANS = tuple(PLAN_ORDER.keys())


def normalize_database_url(value: str) -> str:
    if not value:
        return ""
    normalized = value.strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql://" + normalized[len("postgres://") :]
    if "sslmode=" not in normalized:
        separator = "&" if "?" in normalized else "?"
        normalized = f"{normalized}{separator}sslmode=require"
    return normalized


DATABASE_URL = normalize_database_url(DATABASE_URL_RAW)
USE_POSTGRES = DATABASE_URL.startswith("postgresql://")

psycopg2: Any = None
RealDictCursor: Any = None

if USE_POSTGRES:
    try:
        psycopg2 = importlib.import_module("psycopg2")
        psycopg2_extras = importlib.import_module("psycopg2.extras")
        RealDictCursor = psycopg2_extras.RealDictCursor
    except ImportError as exc:
        raise RuntimeError("DATABASE_URL is set but psycopg2 is not installed") from exc


if os.getenv("RENDER") and ADMIN_PASSWORD == "Admin123456":
    raise RuntimeError("Set SUBSCRIPTION_ADMIN_PASSWORD in production")

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


class AdminCreateUserRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    plan: str = Field(default="free", pattern="^(free|pro|premium)$")


class AdminUpdateUserRequest(BaseModel):
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


def normalize_plan(value: str) -> str:
    plan = str(value or "free").strip().lower()
    if plan not in PLAN_ORDER:
        return "free"
    return plan


def can_access_plan(user_plan: str, required_plan: str) -> bool:
    user_rank = PLAN_ORDER.get(normalize_plan(user_plan), 0)
    required_rank = PLAN_ORDER.get(normalize_plan(required_plan), 0)
    return user_rank >= required_rank


def adapt_query(query: str) -> str:
    if not USE_POSTGRES:
        return query
    return query.replace("?", "%s")


class DBConnection:
    def __init__(self, conn: Any, use_postgres: bool) -> None:
        self._conn = conn
        self._use_postgres = use_postgres

    def __enter__(self) -> "DBConnection":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if exc and self._use_postgres:
            self._conn.rollback()
        self._conn.close()

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> Any:
        if self._use_postgres:
            cursor = self._conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(adapt_query(query), params)
            return cursor
        return self._conn.execute(query, params)

    def executescript(self, script: str) -> None:
        if self._use_postgres:
            for statement in [part.strip() for part in script.split(";") if part.strip()]:
                self.execute(statement)
            return
        self._conn.executescript(script)

    def commit(self) -> None:
        self._conn.commit()


def get_connection() -> DBConnection:
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return DBConnection(conn, True)

    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    return DBConnection(sqlite_conn, False)


def init_db() -> None:
    with get_connection() as conn:
        if USE_POSTGRES:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    plan TEXT NOT NULL DEFAULT 'free',
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS exam_attempts (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    exam_uid TEXT NOT NULL,
                    exam_title TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    answers_json TEXT NOT NULL,
                    score DOUBLE PRECISION,
                    completed_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS favorite_exams (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    exam_uid TEXT NOT NULL,
                    exam_title TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    partial TEXT,
                    file TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id, exam_uid)
                );
                """
            )
            rows = conn.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'users'
                """
            ).fetchall()
            user_columns = {row["column_name"] for row in rows}
        else:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    plan TEXT NOT NULL DEFAULT 'free',
                    role TEXT NOT NULL DEFAULT 'user',
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
            user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}

        if "role" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")

        # Ensure there is exactly one bootstrap admin account for management tasks.
        bootstrap_admin_user(conn)
        conn.commit()


def bootstrap_admin_user(conn: DBConnection) -> None:
    admin_email = normalize_email(ADMIN_EMAIL)
    now = utc_now().isoformat()
    admin = conn.execute("SELECT id FROM users WHERE email = ?", (admin_email,)).fetchone()
    if admin:
        conn.execute(
            "UPDATE users SET role = 'admin', plan = 'premium', updated_at = ? WHERE id = ?",
            (now, admin["id"]),
        )
        return

    password_hash, password_salt = make_password(ADMIN_PASSWORD)
    conn.execute(
        """
        INSERT INTO users (email, name, password_hash, password_salt, plan, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'premium', 'admin', ?, ?)
        """,
        (admin_email, ADMIN_NAME.strip(), password_hash, password_salt, now, now),
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


def issue_session(conn: DBConnection, user_id: int) -> str:
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


def get_current_user(authorization: Optional[str]) -> Dict[str, Any]:
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


def serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "plan": row["plan"],
        "role": row["role"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def require_admin(authorization: Optional[str]) -> Dict[str, Any]:
    user = get_current_user(authorization)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def get_exam_required_plan(catalog_item: Dict[str, Any]) -> str:
    return normalize_plan(catalog_item.get("accessLevel") or "free")


def filter_catalog_by_plan(items: list[Dict[str, Any]], user_plan: str) -> list[Dict[str, Any]]:
    return [item for item in items if can_access_plan(user_plan, get_exam_required_plan(item))]


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


def require_exam_access(user: Dict[str, Any], exam_uid: str) -> Dict[str, Any]:
    catalog_item = get_catalog_item(exam_uid)
    if not catalog_item:
        raise HTTPException(status_code=404, detail="Exam not found")

    required_plan = get_exam_required_plan(catalog_item)
    if not can_access_plan(user["plan"], required_plan):
        raise HTTPException(
            status_code=403,
            detail=f"Exam requires {required_plan} plan",
        )

    return catalog_item


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/subscription/index.html")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def insert_user_and_return_id(
    conn: DBConnection,
    *,
    email: str,
    name: str,
    password_hash: str,
    password_salt: str,
    plan: str,
    role: str,
    now_iso: str,
) -> int:
    if USE_POSTGRES:
        row = conn.execute(
            """
            INSERT INTO users (email, name, password_hash, password_salt, plan, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (email, name, password_hash, password_salt, plan, role, now_iso, now_iso),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create user")
        return int(row["id"])

    cursor = conn.execute(
        """
        INSERT INTO users (email, name, password_hash, password_salt, plan, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (email, name, password_hash, password_salt, plan, role, now_iso, now_iso),
    )
    user_id = cursor.lastrowid
    if user_id is None:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return int(user_id)


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

        user_id = insert_user_and_return_id(
            conn,
            email=email,
            name=payload.name.strip(),
            password_hash=password_hash,
            password_salt=password_salt,
            plan="free",
            role="user",
            now_iso=now,
        )
        conn.commit()
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
            "UPDATE users SET name = ?, updated_at = ? WHERE id = ?",
            (payload.name.strip(), now, user["id"]),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"user": serialize_user(updated)}


@app.get("/api/catalog")
def catalog(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    catalog_payload = load_catalog()
    items = catalog_payload.get("items", []) if isinstance(catalog_payload, dict) else []
    visible_items = filter_catalog_by_plan(items, user["plan"])
    return {
        **catalog_payload,
        "count": len(visible_items),
        "items": visible_items,
        "defaultExamUid": visible_items[0]["examUid"] if visible_items else None,
    }


@app.get("/api/exams/{exam_uid:path}")
def get_exam(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    require_exam_access(user, exam_uid)
    return {"exam": load_exam_by_uid(exam_uid)}


@app.get("/api/exam")
def get_exam_by_query(exam_uid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = get_current_user(authorization)
    require_exam_access(user, exam_uid)
    return {"exam": load_exam_by_uid(exam_uid)}


@app.get("/api/admin/users")
def admin_list_users(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_admin(authorization)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, email, name, plan, role, created_at, updated_at
            FROM users
            ORDER BY role DESC, created_at ASC
            """
        ).fetchall()

    return {"items": [serialize_user(row) for row in rows]}


@app.post("/api/admin/users")
def admin_create_user(payload: AdminCreateUserRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_admin(authorization)
    now = utc_now().isoformat()
    email = normalize_email(payload.email)
    password_hash, password_salt = make_password(payload.password)

    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        user_id = insert_user_and_return_id(
            conn,
            email=email,
            name=payload.name.strip(),
            password_hash=password_hash,
            password_salt=password_salt,
            plan=normalize_plan(payload.plan),
            role="user",
            now_iso=now,
        )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return {"user": serialize_user(user)}


@app.put("/api/admin/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: AdminUpdateUserRequest,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    admin = require_admin(authorization)
    now = utc_now().isoformat()

    with get_connection() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        next_plan = normalize_plan(payload.plan)
        if user["role"] == "admin" and int(admin["id"]) == int(user_id):
            next_plan = "premium"

        conn.execute(
            "UPDATE users SET name = ?, plan = ?, updated_at = ? WHERE id = ?",
            (payload.name.strip(), next_plan, now, user_id),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return {"user": serialize_user(updated)}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, authorization: Optional[str] = Header(default=None)) -> Dict[str, bool]:
    admin = require_admin(authorization)
    if int(admin["id"]) == int(user_id):
        raise HTTPException(status_code=400, detail="Admin user cannot delete itself")

    with get_connection() as conn:
        row = conn.execute("SELECT id, role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        if row["role"] == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete admin user")

        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()

    return {"success": True}


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
    order_clause = (
        "ORDER BY LOWER(subject) ASC, LOWER(COALESCE(partial, '')) ASC, LOWER(exam_title) ASC"
        if USE_POSTGRES
        else "ORDER BY subject COLLATE NOCASE ASC, partial COLLATE NOCASE ASC, exam_title COLLATE NOCASE ASC"
    )
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT exam_uid, exam_title, subject, partial, file, created_at, updated_at
            FROM favorite_exams
            WHERE user_id = ?
            {order_clause}
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
