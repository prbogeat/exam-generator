from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_EXAMS_ROOT = PROJECT_ROOT / "out" / "examenes"
STATIC_JSON_ROOT = PROJECT_ROOT / "docs" / "assets" / "json"
STATIC_EXAMS_ROOT = STATIC_JSON_ROOT / "exams"
STATIC_INDEX_PATH = STATIC_JSON_ROOT / "exams-index.json"
PLAN_ORDER = {"free": 0, "pro": 1, "premium": 2}


def normalize_access_level(value: Any) -> str:
    plan = str(value or "free").strip().lower()
    if plan not in PLAN_ORDER:
        return "free"
    return plan


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as file_handle:
        return json.load(file_handle)


def save_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_handle:
        json.dump(data, file_handle, ensure_ascii=False, indent=2)


def extract_partial(relative_path: Path) -> str:
    for part in relative_path.parts:
        text = str(part).strip()
        if text.lower().startswith("parcial "):
            return text
    return ""


def build_formula_tip(question_count: int, penalty: float, max_score: float) -> str:
    if question_count <= 0:
        return ""

    if penalty > 0:
        return f"[(A - E / {penalty:g}) / {question_count}] x {max_score:g}"

    return f"[(A) / {question_count}] x {max_score:g}"


def build_public_url(relative_path: Path) -> str:
    encoded_parts = [quote(part) for part in relative_path.parts]
    return "assets/json/exams/" + "/".join(encoded_parts)


def is_public_exam(relative_path: Path, payload: Any) -> bool:
    parts_lower = [part.lower() for part in relative_path.parts]
    stem_lower = relative_path.stem.lower()

    if not isinstance(payload, dict):
        return False

    if not isinstance(payload.get("questions"), list) or not isinstance(payload.get("scoring"), dict):
        return False

    if not payload.get("subjectTitle") or not payload.get("examTitle"):
        return False

    if parts_lower and parts_lower[0] == "default":
        return False

    if any("hecho" in part or "correcion" in part or "correccion" in part for part in parts_lower):
        return False

    if "realizado" in stem_lower:
        return False

    return True


def normalize_exam_payload(relative_path: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(payload)
    questions = payload.get("questions") if isinstance(payload.get("questions"), list) else []
    scoring = payload.get("scoring") if isinstance(payload.get("scoring"), dict) else {}
    max_score = float(scoring.get("maxScore", 10) or 10)
    penalty = float(scoring.get("wrongAnswersPerDiscountedCorrect", 0) or 0)

    normalized["subjectTitle"] = str(relative_path.parts[0]) if relative_path.parts else str(payload.get("subjectTitle") or "Asignatura")
    normalized["totalQuestions"] = len(questions)
    normalized["accessLevel"] = normalize_access_level(payload.get("accessLevel"))

    if scoring:
        normalized["scoring"] = {
            **scoring,
            "formulaTip": build_formula_tip(len(questions), penalty, max_score),
        }

    return normalized


def build_catalog_entry(relative_path: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    questions = payload.get("questions") or []
    exam_uid = relative_path.as_posix()
    return {
        "examUid": exam_uid,
        "subject": str(relative_path.parts[0]),
        "partial": extract_partial(relative_path),
        "examTitle": str(payload.get("examTitle") or relative_path.stem),
        "subtitle": str(payload.get("subtitle") or ""),
        "accessLevel": normalize_access_level(payload.get("accessLevel")),
        "totalQuestions": int(payload.get("totalQuestions") or len(questions)),
        "file": build_public_url(relative_path),
        "sourcePath": (Path("out") / "examenes" / relative_path).as_posix(),
    }


def build_catalog_entry_with_source(relative_path: Path, payload: Dict[str, Any], source_base: Path) -> Dict[str, Any]:
    entry = build_catalog_entry(relative_path, payload)
    entry["sourcePath"] = (source_base / relative_path).as_posix()
    return entry


def sync_static_exam_catalog() -> Dict[str, Any]:
    STATIC_JSON_ROOT.mkdir(parents=True, exist_ok=True)
    STATIC_EXAMS_ROOT.mkdir(parents=True, exist_ok=True)

    entry_by_uid: Dict[str, Dict[str, Any]] = {}

    # 1) Normaliza y conserva todo lo que ya existe en docs/assets/json/exams.
    for existing_path in sorted(STATIC_EXAMS_ROOT.rglob("*.json")):
        relative_path = existing_path.relative_to(STATIC_EXAMS_ROOT)
        payload = load_json(existing_path)
        if not is_public_exam(relative_path, payload):
            continue

        normalized_payload = normalize_exam_payload(relative_path, payload)
        save_json(existing_path, normalized_payload)

        entry = build_catalog_entry_with_source(relative_path, normalized_payload, Path("docs") / "assets" / "json" / "exams")
        entry_by_uid[entry["examUid"]] = entry

    # 2) Añade/actualiza con lo que venga de out/examenes sin borrar el resto.
    if OUT_EXAMS_ROOT.exists():
        for source_path in sorted(OUT_EXAMS_ROOT.rglob("*.json")):
            relative_path = source_path.relative_to(OUT_EXAMS_ROOT)
            payload = load_json(source_path)
            if not is_public_exam(relative_path, payload):
                continue

            normalized_payload = normalize_exam_payload(relative_path, payload)

            destination_path = STATIC_EXAMS_ROOT / relative_path
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            save_json(destination_path, normalized_payload)

            entry = build_catalog_entry_with_source(relative_path, normalized_payload, Path("out") / "examenes")
            entry_by_uid[entry["examUid"]] = entry

    entries: List[Dict[str, Any]] = list(entry_by_uid.values())

    entries.sort(key=lambda item: (item["subject"], item["partial"], item["examTitle"], item["examUid"]))

    index_payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(entries),
        "defaultExamUid": entries[0]["examUid"] if entries else "",
        "items": entries,
    }
    save_json(STATIC_INDEX_PATH, index_payload)

    return {
        "count": len(entries),
        "indexPath": str(STATIC_INDEX_PATH),
        "staticRoot": str(STATIC_EXAMS_ROOT),
        "defaultExamUid": index_payload["defaultExamUid"],
    }


def main() -> None:
    result = sync_static_exam_catalog()
    print(f"Catálogo estático actualizado: {result['count']} examen(es).")
    print(f"Índice: {result['indexPath']}")
    print(f"Exámenes públicos: {result['staticRoot']}")


if __name__ == "__main__":
    main()