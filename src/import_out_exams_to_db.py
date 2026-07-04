"""Importa examenes existentes desde out/examenes hacia SQLite local."""

from __future__ import annotations

from pathlib import Path

from exam_db import get_connection, import_exam_file, initialize_database

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_EXAMS_DIR = PROJECT_ROOT / "out" / "examenes"


def main() -> None:
    if not OUT_EXAMS_DIR.exists():
        print(f"No existe el directorio: {OUT_EXAMS_DIR}")
        return

    exam_files = sorted(OUT_EXAMS_DIR.rglob("*.json"))
    if not exam_files:
        print(f"No se encontraron examenes JSON en: {OUT_EXAMS_DIR}")
        return

    imported = 0

    with get_connection() as conn:
        initialize_database(conn)

        for exam_file in exam_files:
            try:
                exam_uid = import_exam_file(conn, exam_file)
                imported += 1
                print(f"OK  {exam_uid}  <-  {exam_file}")
            except Exception as exc:
                print(f"ERR {exam_file}: {exc}")

    print(f"Importacion finalizada. Examenes procesados: {imported}")


if __name__ == "__main__":
    main()
