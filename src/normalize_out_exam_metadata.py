from __future__ import annotations

from pathlib import Path

from static_exam_catalog import OUT_EXAMS_ROOT, is_public_exam, load_json, normalize_exam_payload, save_json


def main() -> None:
    updated = 0

    for source_path in sorted(OUT_EXAMS_ROOT.rglob("*.json")):
        relative_path = source_path.relative_to(OUT_EXAMS_ROOT)
        payload = load_json(source_path)
        if not is_public_exam(relative_path, payload):
            continue

        normalized = normalize_exam_payload(relative_path, payload)
        if normalized != payload:
            save_json(source_path, normalized)
            updated += 1

    print(f"Metadatos normalizados en {updated} examen(es) públicos.")


if __name__ == "__main__":
    main()