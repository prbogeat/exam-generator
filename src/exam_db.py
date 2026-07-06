"""Persistencia de examenes en SQLite o PostgreSQL."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:
    psycopg = None
    dict_row = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "out" / "db" / "exams.db"
POSTGRES_SCHEMA_PATH = PROJECT_ROOT / "src" / "sql" / "postgres_schema.sql"

SUBJECT_CANONICAL_NAMES = {
    "psicobiologia": "Fundamentos de Psicobiología",
    "fundamentos de psicobiologia": "Fundamentos de Psicobiología",
    "fundamentos de psicobiología": "Fundamentos de Psicobiología",
    "emocion": "Psicología de la Emoción",
    "psicologia de la emocion": "Psicología de la Emoción",
    "psicología de la emoción": "Psicología de la Emoción",
}


def _utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _compute_exam_uid(exam: Dict[str, Any]) -> str:
    payload = {
        "subjectTitle": exam.get("subjectTitle", ""),
        "examTitle": exam.get("examTitle", ""),
        "subtitle": exam.get("subtitle", ""),
        "scoring": exam.get("scoring", {}),
        "questions": exam.get("questions", []),
    }
    return hashlib.sha1(_canonical_json(payload).encode("utf-8")).hexdigest()


def _database_url() -> str:
    return str(os.getenv("EXAM_DB_URL") or os.getenv("DATABASE_URL") or "").strip()


def _is_postgres_connection(conn: Any) -> bool:
    return "psycopg" in conn.__class__.__module__.lower()


def _extract_subject_from_source_path(source_path: Optional[str]) -> str:
    if not source_path:
        return ""

    normalized = str(source_path).replace("\\", "/")
    parts = [p for p in normalized.split("/") if p]

    for i in range(0, len(parts) - 2):
        if parts[i].lower() == "out" and parts[i + 1].lower() == "examenes":
            return parts[i + 2]

    return ""


def _normalize_subject_name(subject: str) -> str:
    cleaned = str(subject or "").strip()
    if not cleaned:
        return ""

    key = cleaned.lower()
    return SUBJECT_CANONICAL_NAMES.get(key, cleaned)


def _derive_subject(exam: Dict[str, Any], source_path: Optional[str]) -> str:
    subject = _extract_subject_from_source_path(source_path)
    if subject:
        return _normalize_subject_name(subject)

    fallback = str(exam.get("subject", "") or exam.get("subjectTitle", "")).strip()
    normalized = _normalize_subject_name(fallback)
    return normalized or "desconocida"


def _table_columns_sqlite(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row[1]) for row in rows}


def _migrate_sqlite_subject_column(conn: sqlite3.Connection) -> None:
    columns = _table_columns_sqlite(conn, "exams")
    if "subject" not in columns:
        conn.execute("ALTER TABLE exams ADD COLUMN subject TEXT")

    rows = conn.execute(
        """
        SELECT id, source_path, subject_title, subject
        FROM exams
        """
    ).fetchall()

    for row in rows:
        source_subject = _extract_subject_from_source_path(str(row["source_path"] or ""))
        current_subject = str(row["subject"] or "").strip()
        title_subject = str(row["subject_title"] or "").strip()

        chosen = source_subject or current_subject or title_subject or "desconocida"
        normalized = _normalize_subject_name(chosen) or "desconocida"

        if normalized != current_subject:
            conn.execute("UPDATE exams SET subject = ? WHERE id = ?", (normalized, int(row["id"])))


def _execute_postgres_schema(conn: Any) -> None:
    schema_sql = POSTGRES_SCHEMA_PATH.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        for stmt in schema_sql.split(";"):
            sql = stmt.strip()
            if sql:
                cur.execute(sql)


def _migrate_postgres_subject_column(conn: Any) -> None:
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject TEXT")
        cur.execute("SELECT id, source_path, subject_title, subject FROM exams")
        rows = cur.fetchall()

        for row in rows:
            source_subject = _extract_subject_from_source_path(str(row["source_path"] or ""))
            current_subject = str(row["subject"] or "").strip()
            title_subject = str(row["subject_title"] or "").strip()

            chosen = source_subject or current_subject or title_subject or "desconocida"
            normalized = _normalize_subject_name(chosen) or "desconocida"

            if normalized != current_subject:
                cur.execute("UPDATE exams SET subject = %s WHERE id = %s", (normalized, int(row["id"])))


def get_connection(db_path: Path = DEFAULT_DB_PATH) -> Any:
    db_url = _database_url()
    if db_url:
        if psycopg is None:
            raise RuntimeError(
                "PostgreSQL configurado pero falta psycopg. Ejecuta: pip install -r requirements.txt"
            )
        conn = psycopg.connect(db_url)
        conn.row_factory = dict_row
        return conn

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def initialize_database(conn: Any) -> None:
    if _is_postgres_connection(conn):
        _execute_postgres_schema(conn)
        _migrate_postgres_subject_column(conn)
        conn.commit()
        return

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_uid TEXT NOT NULL UNIQUE,
            subject TEXT,
            subject_title TEXT NOT NULL,
            exam_title TEXT NOT NULL,
            subtitle TEXT,
            notice TEXT,
            max_score REAL,
            wrong_answers_per_discounted_correct REAL,
            time_limit_minutes INTEGER,
            formula_tip TEXT,
            total_questions INTEGER NOT NULL,
            source_path TEXT,
            exam_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exam_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            source_id INTEGER,
            question_text TEXT NOT NULL,
            correct_option TEXT,
            explanation TEXT,
            image TEXT
        );

        CREATE TABLE IF NOT EXISTS exam_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
            option_key TEXT NOT NULL,
            option_text TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_exams_updated_at ON exams(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON exam_questions(exam_id);
        CREATE INDEX IF NOT EXISTS idx_options_question_id ON exam_options(question_id);
        """
    )
    _migrate_sqlite_subject_column(conn)
    conn.commit()


def upsert_exam(conn: Any, exam: Dict[str, Any], source_path: Optional[str] = None) -> str:
    initialize_database(conn)

    exam_uid = str(exam.get("examUid") or _compute_exam_uid(exam))
    scoring = exam.get("scoring") if isinstance(exam.get("scoring"), dict) else {}
    subject = _derive_subject(exam, source_path)
    now_iso = _utc_now_iso()

    if _is_postgres_connection(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO exams (
                    exam_uid,
                    subject,
                    subject_title,
                    exam_title,
                    subtitle,
                    notice,
                    max_score,
                    wrong_answers_per_discounted_correct,
                    time_limit_minutes,
                    formula_tip,
                    total_questions,
                    source_path,
                    exam_json,
                    created_at,
                    updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (exam_uid) DO UPDATE SET
                    subject = EXCLUDED.subject,
                    subject_title = EXCLUDED.subject_title,
                    exam_title = EXCLUDED.exam_title,
                    subtitle = EXCLUDED.subtitle,
                    notice = EXCLUDED.notice,
                    max_score = EXCLUDED.max_score,
                    wrong_answers_per_discounted_correct = EXCLUDED.wrong_answers_per_discounted_correct,
                    time_limit_minutes = EXCLUDED.time_limit_minutes,
                    formula_tip = EXCLUDED.formula_tip,
                    total_questions = EXCLUDED.total_questions,
                    source_path = EXCLUDED.source_path,
                    exam_json = EXCLUDED.exam_json,
                    updated_at = EXCLUDED.updated_at
                RETURNING id
                """,
                (
                    exam_uid,
                    subject,
                    str(exam.get("subjectTitle", "")),
                    str(exam.get("examTitle", "")),
                    str(exam.get("subtitle", "")),
                    str(exam.get("notice", "")),
                    float(scoring.get("maxScore", 10.0)),
                    float(scoring.get("wrongAnswersPerDiscountedCorrect", 0.0)),
                    int(scoring.get("timeLimitMinutes", 90)),
                    str(scoring.get("formulaTip", "")),
                    len(exam.get("questions", [])),
                    source_path,
                    _canonical_json(exam),
                    now_iso,
                    now_iso,
                ),
            )
            exam_id = int(cur.fetchone()["id"])

            cur.execute(
                "DELETE FROM exam_options WHERE question_id IN (SELECT id FROM exam_questions WHERE exam_id = %s)",
                (exam_id,),
            )
            cur.execute("DELETE FROM exam_questions WHERE exam_id = %s", (exam_id,))

            for question in exam.get("questions", []):
                cur.execute(
                    """
                    INSERT INTO exam_questions (
                        exam_id,
                        position,
                        source_id,
                        question_text,
                        correct_option,
                        explanation,
                        image
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        exam_id,
                        int(question.get("id", 0) or 0),
                        int(question.get("sourceId", 0) or 0),
                        str(question.get("text", "")),
                        str(question.get("correctOption", "")),
                        str(question.get("explanation", "")),
                        str(question.get("image", "")) if question.get("image") else None,
                    ),
                )
                question_id = int(cur.fetchone()["id"])

                for option in question.get("options", []):
                    cur.execute(
                        """
                        INSERT INTO exam_options (question_id, option_key, option_text)
                        VALUES (%s, %s, %s)
                        """,
                        (question_id, str(option.get("key", "")), str(option.get("text", ""))),
                    )

        conn.commit()
        return exam_uid

    existing = conn.execute("SELECT id FROM exams WHERE exam_uid = ?", (exam_uid,)).fetchone()
    if existing:
        exam_id = int(existing["id"])
        conn.execute(
            """
            UPDATE exams
            SET subject = ?,
                subject_title = ?,
                exam_title = ?,
                subtitle = ?,
                notice = ?,
                max_score = ?,
                wrong_answers_per_discounted_correct = ?,
                time_limit_minutes = ?,
                formula_tip = ?,
                total_questions = ?,
                source_path = ?,
                exam_json = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                subject,
                str(exam.get("subjectTitle", "")),
                str(exam.get("examTitle", "")),
                str(exam.get("subtitle", "")),
                str(exam.get("notice", "")),
                float(scoring.get("maxScore", 10.0)),
                float(scoring.get("wrongAnswersPerDiscountedCorrect", 0.0)),
                int(scoring.get("timeLimitMinutes", 90)),
                str(scoring.get("formulaTip", "")),
                len(exam.get("questions", [])),
                source_path,
                _canonical_json(exam),
                now_iso,
                exam_id,
            ),
        )
        conn.execute(
            "DELETE FROM exam_options WHERE question_id IN (SELECT id FROM exam_questions WHERE exam_id = ?)",
            (exam_id,),
        )
        conn.execute("DELETE FROM exam_questions WHERE exam_id = ?", (exam_id,))
    else:
        cur = conn.execute(
            """
            INSERT INTO exams (
                exam_uid,
                subject,
                subject_title,
                exam_title,
                subtitle,
                notice,
                max_score,
                wrong_answers_per_discounted_correct,
                time_limit_minutes,
                formula_tip,
                total_questions,
                source_path,
                exam_json,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exam_uid,
                subject,
                str(exam.get("subjectTitle", "")),
                str(exam.get("examTitle", "")),
                str(exam.get("subtitle", "")),
                str(exam.get("notice", "")),
                float(scoring.get("maxScore", 10.0)),
                float(scoring.get("wrongAnswersPerDiscountedCorrect", 0.0)),
                int(scoring.get("timeLimitMinutes", 90)),
                str(scoring.get("formulaTip", "")),
                len(exam.get("questions", [])),
                source_path,
                _canonical_json(exam),
                now_iso,
                now_iso,
            ),
        )
        exam_id = int(cur.lastrowid)

    for question in exam.get("questions", []):
        q_cur = conn.execute(
            """
            INSERT INTO exam_questions (
                exam_id,
                position,
                source_id,
                question_text,
                correct_option,
                explanation,
                image
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exam_id,
                int(question.get("id", 0) or 0),
                int(question.get("sourceId", 0) or 0),
                str(question.get("text", "")),
                str(question.get("correctOption", "")),
                str(question.get("explanation", "")),
                str(question.get("image", "")) if question.get("image") else None,
            ),
        )
        question_id = int(q_cur.lastrowid)

        for option in question.get("options", []):
            conn.execute(
                """
                INSERT INTO exam_options (question_id, option_key, option_text)
                VALUES (?, ?, ?)
                """,
                (question_id, str(option.get("key", "")), str(option.get("text", ""))),
            )

    conn.commit()
    return exam_uid


def list_exams(conn: Any, limit: int = 100) -> List[Dict[str, Any]]:
    initialize_database(conn)

    if _is_postgres_connection(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    exam_uid,
                    subject,
                    subject AS subject_folder,
                    subject_title,
                    exam_title,
                    subtitle,
                    total_questions,
                    source_path,
                    created_at,
                    updated_at
                FROM exams
                ORDER BY updated_at DESC, id DESC
                LIMIT %s
                """,
                (limit,),
            )
            return [dict(row) for row in cur.fetchall()]

    rows = conn.execute(
        """
        SELECT
            exam_uid,
            subject,
            subject AS subject_folder,
            subject_title,
            exam_title,
            subtitle,
            total_questions,
            source_path,
            created_at,
            updated_at
        FROM exams
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_exam_json_by_uid(conn: Any, exam_uid: str) -> Optional[Dict[str, Any]]:
    initialize_database(conn)

    if _is_postgres_connection(conn):
        with conn.cursor() as cur:
            cur.execute("SELECT exam_json FROM exams WHERE exam_uid = %s", (exam_uid,))
            row = cur.fetchone()
    else:
        row = conn.execute("SELECT exam_json FROM exams WHERE exam_uid = ?", (exam_uid,)).fetchone()

    if not row:
        return None
    return json.loads(str(row["exam_json"]))


def get_latest_exam_json(conn: Any) -> Optional[Dict[str, Any]]:
    initialize_database(conn)

    if _is_postgres_connection(conn):
        with conn.cursor() as cur:
            cur.execute("SELECT exam_json FROM exams ORDER BY updated_at DESC, id DESC LIMIT 1")
            row = cur.fetchone()
    else:
        row = conn.execute(
            "SELECT exam_json FROM exams ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1"
        ).fetchone()

    if not row:
        return None
    return json.loads(str(row["exam_json"]))


def import_exam_file(conn: Any, exam_file: Path) -> str:
    with exam_file.open("r", encoding="utf-8-sig") as fh:
        exam_data = json.load(fh)

    return upsert_exam(conn, exam_data, source_path=str(exam_file))
