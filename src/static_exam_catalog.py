from __future__ import annotations

import json
import re
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
DEFAULT_DEGREE_TITLE = "Grado en Psicología"
DEFAULT_COURSE_TITLE = "1º"
MONTHS_ES = {
    "enero": "Enero",
    "febrero": "Febrero",
    "marzo": "Marzo",
    "abril": "Abril",
    "mayo": "Mayo",
    "junio": "Junio",
    "julio": "Julio",
    "agosto": "Agosto",
    "septiembre": "Septiembre",
    "octubre": "Octubre",
    "noviembre": "Noviembre",
    "diciembre": "Diciembre",
}


def looks_like_course(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    return bool(re.match(r"^\d+\s*(?:º|°|o)?$", text))


def resolve_hierarchy(relative_path: Path, payload: Dict[str, Any]) -> Dict[str, str]:
    parts = [str(part).strip() for part in relative_path.parts if str(part).strip()]

    degree_title = str(payload.get("degreeTitle") or payload.get("degree") or "").strip()
    course_title = str(payload.get("courseTitle") or payload.get("course") or "").strip()
    subject_title = str(payload.get("subjectTitle") or "").strip()

    if len(parts) >= 3 and looks_like_course(parts[1]):
        degree_title = degree_title or parts[0]
        course_title = course_title or parts[1]
        subject_title = subject_title or parts[2]
    else:
        subject_title = subject_title or (parts[0] if parts else "Asignatura")

    return {
        "degreeTitle": degree_title or DEFAULT_DEGREE_TITLE,
        "courseTitle": course_title or DEFAULT_COURSE_TITLE,
        "subjectTitle": subject_title or "Asignatura",
    }


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
        match = re.match(r"^parcial[\s-]+(\d+)$", text, flags=re.IGNORECASE)
        if match:
            return f"Parcial {match.group(1)}"
    return ""


def extract_date_and_type_from_path(relative_path: Path) -> tuple[str, str, str]:
    stem = relative_path.stem.lower()
    month_pattern = r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)"
    patterns = [
        rf"{month_pattern}-(\d{{4}})-tipo-([a-z])(?:$|-)",
        rf"{month_pattern}-([a-z])-(\d{{4}})(?:$|-)",
        rf"{month_pattern}-(\d{{4}})-([a-z])$",
        rf"{month_pattern}-(\d{{4}})(?:$|-)",
    ]

    for index, pattern in enumerate(patterns):
        match = re.search(pattern, stem, flags=re.IGNORECASE)
        if not match:
            continue

        month = MONTHS_ES.get(match.group(1).lower(), match.group(1).title())
        if index == 1:
            return month, match.group(3), match.group(2).upper()
        if index in (0, 2):
            return month, match.group(2), match.group(3).upper()
        return month, match.group(2), ""

    return "", "", ""


def build_normalized_exam_title(relative_path: Path, payload: Dict[str, Any]) -> str:
    partial = extract_partial(relative_path)
    partial_suffix = f" ({partial})" if partial else ""
    raw_title = str(payload.get("examTitle") or "").strip()
    stem = relative_path.stem.lower()
    total_questions = int(payload.get("totalQuestions") or len(payload.get("questions") or []))

    if "generado" in stem and total_questions >= 250:
        return "UNED - Banco completo"

    if re.search(r"(?:^|-)40-a(?:-|$)", stem) or "al azar" in raw_title.lower():
        return "UNED - al azar"

    match_40 = re.search(r"(?:^|-)40-([a-z])(?:-|$)", stem)
    if match_40:
        return f"UNED - Tipo {match_40.group(1).upper()}"

    if "examen-generado" in stem:
        return f"UNED - Examen Generado{partial_suffix}"

    match_number = re.search(r"examen-uned-(\d+)", stem)
    if match_number:
        return f"UNED - Examen {match_number.group(1)}{partial_suffix}"

    month, year, exam_type = extract_date_and_type_from_path(relative_path)
    if month and year:
        type_suffix = f" - Tipo {exam_type}" if exam_type else ""
        return f"UNED - {month} {year}{type_suffix}{partial_suffix}"

    if raw_title:
        cleaned_title = raw_title.replace("·", "-")
        cleaned_title = re.sub(r"\s+", " ", cleaned_title).strip()
        cleaned_title = re.sub(r"UNED\s*-\s*Examen UNED\s+", "UNED - Examen ", cleaned_title, flags=re.IGNORECASE)
        return cleaned_title

    return f"UNED{partial_suffix}" if partial else "UNED"


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
    hierarchy = resolve_hierarchy(relative_path, payload)
    questions = payload.get("questions") if isinstance(payload.get("questions"), list) else []
    scoring = payload.get("scoring") if isinstance(payload.get("scoring"), dict) else {}
    max_score = float(scoring.get("maxScore", 10) or 10)
    penalty = float(scoring.get("wrongAnswersPerDiscountedCorrect", 0) or 0)

    normalized["degreeTitle"] = hierarchy["degreeTitle"]
    normalized["courseTitle"] = hierarchy["courseTitle"]
    normalized["subjectTitle"] = hierarchy["subjectTitle"]
    normalized["examTitle"] = build_normalized_exam_title(relative_path, normalized)
    normalized["totalQuestions"] = len(questions)
    normalized["accessLevel"] = normalize_access_level(payload.get("accessLevel"))

    if scoring:
        normalized["scoring"] = {
            **scoring,
            "formulaTip": build_formula_tip(len(questions), penalty, max_score),
        }

    return normalized


def build_catalog_entry(relative_path: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    hierarchy = resolve_hierarchy(relative_path, payload)
    questions = payload.get("questions") or []
    exam_uid = relative_path.as_posix()
    return {
        "examUid": exam_uid,
        "degree": hierarchy["degreeTitle"],
        "degreeTitle": hierarchy["degreeTitle"],
        "course": hierarchy["courseTitle"],
        "courseTitle": hierarchy["courseTitle"],
        "subject": hierarchy["subjectTitle"],
        "subjectTitle": hierarchy["subjectTitle"],
        "partial": extract_partial(relative_path),
        "examTitle": build_normalized_exam_title(relative_path, payload),
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


def build_catalog_hierarchy(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    degree_map: Dict[str, Dict[str, Any]] = {}

    for entry in entries:
        degree_name = str(entry.get("degree") or DEFAULT_DEGREE_TITLE).strip() or DEFAULT_DEGREE_TITLE
        course_name = str(entry.get("course") or DEFAULT_COURSE_TITLE).strip() or DEFAULT_COURSE_TITLE
        subject_name = str(entry.get("subject") or "Asignatura").strip() or "Asignatura"
        partial_name = str(entry.get("partial") or "").strip()
        exam_uid = str(entry.get("examUid") or "").strip()

        degree_node = degree_map.setdefault(degree_name, {"degree": degree_name, "count": 0, "courses": {}})
        degree_node["count"] += 1

        course_node = degree_node["courses"].setdefault(course_name, {"course": course_name, "count": 0, "subjects": {}})
        course_node["count"] += 1

        subject_node = course_node["subjects"].setdefault(
            subject_name,
            {"subject": subject_name, "count": 0, "partials": set(), "examUids": []},
        )
        subject_node["count"] += 1
        subject_node["examUids"].append(exam_uid)
        if partial_name:
            subject_node["partials"].add(partial_name)

    degrees: List[Dict[str, Any]] = []
    for degree_name in sorted(degree_map, key=str.lower):
        degree_node = degree_map[degree_name]
        courses: List[Dict[str, Any]] = []

        for course_name in sorted(degree_node["courses"], key=str.lower):
            course_node = degree_node["courses"][course_name]
            subjects: List[Dict[str, Any]] = []

            for subject_name in sorted(course_node["subjects"], key=str.lower):
                subject_node = course_node["subjects"][subject_name]
                subjects.append(
                    {
                        "subject": subject_node["subject"],
                        "count": subject_node["count"],
                        "partials": sorted(subject_node["partials"]),
                        "examUids": subject_node["examUids"],
                    }
                )

            courses.append(
                {
                    "course": course_node["course"],
                    "count": course_node["count"],
                    "subjects": subjects,
                }
            )

        degrees.append(
            {
                "degree": degree_node["degree"],
                "count": degree_node["count"],
                "courses": courses,
            }
        )

    return {"degrees": degrees}


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

    # 2) Actualiza con out/examenes solo los exámenes ya presentes en docs/assets/json/exams.
    # Esto evita incorporar altas nuevas no publicadas explícitamente.
    if OUT_EXAMS_ROOT.exists():
        for source_path in sorted(OUT_EXAMS_ROOT.rglob("*.json")):
            relative_path = source_path.relative_to(OUT_EXAMS_ROOT)
            payload = load_json(source_path)
            if not is_public_exam(relative_path, payload):
                continue

            if relative_path.as_posix() not in entry_by_uid:
                continue

            normalized_payload = normalize_exam_payload(relative_path, payload)

            destination_path = STATIC_EXAMS_ROOT / relative_path
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            save_json(destination_path, normalized_payload)

            entry = build_catalog_entry_with_source(relative_path, normalized_payload, Path("out") / "examenes")
            entry_by_uid[entry["examUid"]] = entry

    entries: List[Dict[str, Any]] = list(entry_by_uid.values())

    entries.sort(
        key=lambda item: (
            item.get("degree", ""),
            item.get("course", ""),
            item.get("subject", ""),
            item.get("partial", ""),
            item.get("examTitle", ""),
            item.get("examUid", ""),
        )
    )

    index_payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(entries),
        "defaultExamUid": entries[0]["examUid"] if entries else "",
        "items": entries,
        "hierarchy": build_catalog_hierarchy(entries),
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