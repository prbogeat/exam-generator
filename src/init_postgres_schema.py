"""Inicializa el esquema PostgreSQL del proyecto.

Uso:
  EXAM_DB_URL=postgresql://usuario@localhost:5432/examenes_local python src/init_postgres_schema.py
"""

from __future__ import annotations

from exam_db import get_connection, initialize_database


def main() -> None:
    with get_connection() as conn:
        initialize_database(conn)
    print("Esquema PostgreSQL inicializado correctamente.")


if __name__ == "__main__":
    main()
