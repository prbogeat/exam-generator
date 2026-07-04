"""Persistencia local de examenes en SQLite."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "out" / "db" / "exams.db"


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
    digest = hashlib.sha1(_canonical_json(payload).encode("utf-8")).hexdigest()
    return digest


def _extract_subject_from_source_path(source_path: Optional[str]) -> str:
    if not source_path:
        return ""

    normalized = str(source_path).replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]

    for idx in range(0, len(parts) - 2):
        if parts[idx].lower() == "out" and parts[idx + 1].lower() == "examenes":
            return parts[idx + 2]

    return ""


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row[1]) for row in rows}


def _migrate_subject_column(conn: sqlite3.Connection) -> None:
    columns = _table_columns(conn, "exams")
    if "subject_folder" not in columns:
        conn.execute("ALTER TABLE exams ADD COLUMN subject_folder TEXT")

    rows = conn.execute(
        """
        SELECT id, source_path, subject_title
        FROM exams
        WHERE COALESCE(TRIM(subject_folder), '') = ''
        """
    ).fetchall()

    for row in rows:
        subject_folder = _extract_subject_from_source_path(str(row["source_path"] or ""))
        if not subject_folder:
            subject_folder = str(row["subject_title"] or "").strip()

        conn.execute(
            "UPDATE exams SET subject_folder = ? WHERE id = ?",
            (subject_folder, int(row["id"])),
        )


def get_connection(db_path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def initialize_database(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_uid TEXT NOT NULL UNIQUE,
            subject_folder TEXT,
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
    _migrate_subject_column(conn)
    conn.commit()


def upsert_exam(
    conn: sqlite3.Connection,
    exam: Dict[str, Any],
    source_path: Optional[str] = None,
) -> str:
    initialize_database(conn)

    exam_uid = str(exam.get("examUid") or _compute_exam_uid(exam))
    scoring = exam.get("scoring") if isinstance(exam.get("scoring"), dict) else {}
    subject_folder = _extract_subject_from_source_path(source_path)
    if not subject_folder:
        subject_folder = str(exam.get("subjectTitle", "")).strip()
    now_iso = _utc_now_iso()

    existing = conn.execute("SELECT id, created_at FROM exams WHERE exam_uid = ?", (exam_uid,)).fetchone()

    if existing:
        exam_id = int(existing["id"])
        created_at = str(existing["created_at"])
        conn.execute(
            """
            UPDATE exams
            SET subject_folder = ?,
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
                subject_folder,
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
        conn.execute("DELETE FROM exam_options WHERE question_id IN (SELECT id FROM exam_questions WHERE exam_id = ?)", (exam_id,))
        conn.execute("DELETE FROM exam_questions WHERE exam_id = ?", (exam_id,))
    else:
        created_at = now_iso
        cur = conn.execute(
            """
            INSERT INTO exams (
                exam_uid,
                subject_folder,
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
                subject_folder,
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
                created_at,
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
                (
                    question_id,
                    str(option.get("key", "")),
                    str(option.get("text", "")),
                ),
            )

    conn.commit()
    return exam_uid


def list_exams(conn: sqlite3.Connection, limit: int = 100) -> List[Dict[str, Any]]:
    initialize_database(conn)
    rows = conn.execute(
        """
        SELECT
            exam_uid,
            subject_folder,
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


def get_exam_json_by_uid(conn: sqlite3.Connection, exam_uid: str) -> Optional[Dict[str, Any]]:
    initialize_database(conn)
    row = conn.execute(
        "SELECT exam_json FROM exams WHERE exam_uid = ?",
        (exam_uid,),
    ).fetchone()
    if not row:
        return None
    return json.loads(str(row["exam_json"]))


def get_latest_exam_json(conn: sqlite3.Connection) -> Optional[Dict[str, Any]]:
    initialize_database(conn)
    row = conn.execute(
        "SELECT exam_json FROM exams ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    return json.loads(str(row["exam_json"]))


def import_exam_file(conn: sqlite3.Connection, exam_file: Path) -> str:
    with exam_file.open("r", encoding="utf-8-sig") as fh:
        exam_data = json.load(fh)

    source = str(exam_file)
    return upsert_exam(conn, exam_data, source_path=source)
