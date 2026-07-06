"""
Librería de generación de exámenes - Lógica reutilizable.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, List

import os
import sys
from pathlib import Path as _Path

# Asegurar que el CWD sea la raíz del proyecto para que los paths relativos funcionen
_PROJECT_ROOT = _Path(__file__).resolve().parent.parent
os.chdir(_PROJECT_ROOT)

from exam_presets import GENERAL_INPUT_ROOT, GENERAL_OUTPUT_ROOT, GENERAL_REALIZED_ROOT
from exam_db import get_connection, upsert_exam
from static_exam_catalog import sync_static_exam_catalog


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def save_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_source_questions(source_root: Any) -> List[Dict[str, Any]]:
    if isinstance(source_root, list):
        return source_root

    if isinstance(source_root, dict) and isinstance(source_root.get("questions"), list):
        return source_root["questions"]

    raise ValueError(
        "Formato de entrada no soportado. Debe ser un array de preguntas o un objeto con la clave 'questions'."
    )


def question_text(question: Dict[str, Any]) -> str:
    text = question.get("pregunta") or question.get("text") or ""
    return str(text).strip()


def question_explanation(question: Dict[str, Any]) -> str:
    explanation = question.get("explicacion") or question.get("explanation") or ""
    return str(explanation)


def question_correct_option(question: Dict[str, Any]) -> str:
    correct = question.get("correcta") or question.get("correctOption") or ""
    return str(correct).strip().upper()


def safe_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def convert_options(question: Dict[str, Any]) -> List[Dict[str, str]]:
    if isinstance(question.get("opciones"), dict):
        sorted_keys = sorted(question["opciones"].keys(), key=lambda k: str(k).upper())
        return [
            {
                "key": str(k).strip().upper(),
                "text": str(question["opciones"][k]),
            }
            for k in sorted_keys
        ]

    if isinstance(question.get("options"), list):
        result: List[Dict[str, str]] = []
        for idx, option in enumerate(question["options"]):
            fallback_key = chr(65 + idx)
            key = str(option.get("key", fallback_key)).strip().upper() or fallback_key
            result.append({"key": key, "text": str(option.get("text", ""))})
        return result

    return []


def derive_template_path(output_path: Path) -> Path:
    """Deriva la ruta de la plantilla a partir del path de salida del examen generado.

    Ejemplo: out/examenes/Fundamentos de Psicobiología/Parcial 1/examen.json
             → input/examenes_realizados/Fundamentos de Psicobiología/Parcial 1/examen.json
    """
    # Obtener la asignatura y carpetas intermedias del path de salida
    parts = output_path.parts
    # Asumir que la estructura es: out/examenes/[subject]/[intermediate-dirs]/[file]
    # Extraer todo después de "examenes" excepto el archivo
    if len(parts) >= 4:
        # parts[0] = "out", parts[1] = "examenes", parts[2:] = carpetas y archivo
        # Tomamos las carpetas intermedias (todo excepto el archivo)
        subject_and_dirs = parts[2:-1]  # Exclude "out", "examenes", y el archivo
        return Path("input") / "examenes_realizados" / Path(*subject_and_dirs) / output_path.name
    elif len(parts) == 3:
        # Caso: out/examenes/file.json (sin carpetas intermedias)
        subject = parts[2]
        return Path("input") / "examenes_realizados" / subject
    else:
        return Path("input") / "examenes_realizados" / output_path.name


def build_realized_template(converted_exam: Dict[str, Any]) -> Dict[str, Any]:
    """Construye una plantilla de examen realizado lista para rellenar y corregir."""
    return {
        "subject": converted_exam["subjectTitle"],
        "type": converted_exam["examTitle"],
        "date": "",
        "description": "",
        "questions": [
            {
                "id": q["id"],
                "text": q["text"],
                "marked_option": "",
            }
            for q in converted_exam["questions"]
        ],
    }


def default_formula_tip(penalty: float, question_count: int, max_score: float) -> str:
    if question_count <= 0:
        return ""

    if penalty > 0:
        return f"[(A - E / {penalty:g}) / {question_count}] x {max_score:g}"

    return f"[(A) / {question_count}] x {max_score:g}"


def convert_exam(
    source_questions: List[Dict[str, Any]],
    number_of_questions: int,
    random_selection: bool,
    subject_title: str,
    exam_title: str,
    subtitle: str,
    notice: str,
    max_score: float,
    wrong_answers_per_discounted_correct: float,
    time_limit_minutes: int,
    formula_tip: str,
    random_seed: int = None,
) -> Dict[str, Any]:
    """Convierte preguntas brutas en examen formateado."""
    
    source_questions = list(source_questions)
    rng = random.Random(random_seed)

    if number_of_questions < 0:
        raise ValueError("number_of_questions no puede ser negativo.")

    if number_of_questions > 0:
        if number_of_questions > len(source_questions):
            raise ValueError(
                "number_of_questions no puede ser mayor que las preguntas disponibles "
                f"({len(source_questions)})."
            )
        if random_selection:
            source_questions = rng.sample(source_questions, number_of_questions)
        else:
            source_questions = source_questions[:number_of_questions]
    elif random_selection:
        rng.shuffle(source_questions)

    converted_questions: List[Dict[str, Any]] = []

    for index, question in enumerate(source_questions, start=1):
        source_id = safe_int(question.get("id"), index)
        text = question_text(question)
        options = convert_options(question)
        correct_option = question_correct_option(question)
        explanation = question_explanation(question)
        image = str(question.get("imagen") or question.get("image") or "").strip()

        if not text:
            raise ValueError(f"La pregunta con id '{source_id}' no tiene texto (pregunta/text).")

        if len(options) < 2:
            raise ValueError(f"La pregunta con id '{source_id}' debe tener al menos 2 opciones.")

        option_keys = {opt["key"] for opt in options}
        if correct_option and correct_option not in option_keys:
            raise ValueError(
                f"La pregunta con id '{source_id}' tiene correctOption '{correct_option}' que no existe en opciones."
            )

        converted_q: Dict[str, Any] = {
            "id": index,
            "sourceId": source_id,
            "used": True,
            "text": text,
            "options": options,
            "correctOption": correct_option,
            "explanation": explanation,
        }
        if image:
            converted_q["image"] = image

        converted_questions.append(converted_q)

    question_count = len(converted_questions)
    final_formula_tip = formula_tip.strip() or default_formula_tip(
        wrong_answers_per_discounted_correct,
        question_count,
        max_score,
    )

    return {
        "subjectTitle": subject_title,
        "examTitle": exam_title,
        "subtitle": subtitle,
        "notice": notice,
        "scoring": {
            "maxScore": max_score,
            "wrongAnswersPerDiscountedCorrect": wrong_answers_per_discounted_correct,
            "timeLimitMinutes": time_limit_minutes,
            "formulaTip": final_formula_tip,
        },
        "questions": converted_questions,
    }


def generate_exam_from_config(input_json_content: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Genera un examen a partir de contenido JSON y configuración.
    
    Args:
        input_json_content: Contenido JSON como string del banco de preguntas
        config: Diccionario con configuración (subjectTitle, examTitle, numberOfQuestions, etc.)
    
    Returns:
        {
            "success": bool,
            "outputPath": str,  # Si success=True
            "templatePath": str,  # Si success=True
            "error": str,  # Si success=False
        }
    """
    try:
        # Parsear JSON de entrada
        source_data = json.loads(input_json_content)
        source_questions = get_source_questions(source_data)

        # Extraer configuración
        subject_title = str(config.get("subjectTitle", "Asignatura")).strip()
        exam_title = str(config.get("examTitle", "Examen")).strip()
        subtitle = str(config.get("subtitle", "")).strip()
        notice = str(config.get("notice", "")).strip()
        number_of_questions = int(config.get("numberOfQuestions", 0))
        max_score = float(config.get("maxScore", 10.0))
        wrong_answers_per_discounted_correct = float(config.get("wrongAnswersPerDiscountedCorrect", 0))
        time_limit_minutes = int(config.get("timeLimitMinutes", 90))
        random_selection = bool(config.get("randomSelection", False))
        formula_tip = str(config.get("formulaTip", "")).strip()
        output_path_str = str(config.get("outputPath", "")).strip()
        output_file_name = str(config.get("outputFileName", "examen.json")).strip() or "examen.json"
        save_files = bool(config.get("saveFiles", True))

        # Convertir examen
        converted_exam = convert_exam(
            source_questions=source_questions,
            number_of_questions=number_of_questions if number_of_questions > 0 else len(source_questions),
            random_selection=random_selection,
            subject_title=subject_title,
            exam_title=exam_title,
            subtitle=subtitle,
            notice=notice,
            max_score=max_score,
            wrong_answers_per_discounted_correct=wrong_answers_per_discounted_correct,
            time_limit_minutes=time_limit_minutes,
            formula_tip=formula_tip,
        )

        template = build_realized_template(converted_exam)

        # Solo guardar en disco si hay outputPath y saveFiles es True
        if save_files and output_path_str:
            output_path = Path(output_path_str)
            save_json(output_path, converted_exam)

            with get_connection() as conn:
                upsert_exam(conn, converted_exam, source_path=str(output_path))

            template_path = derive_template_path(output_path)
            save_json(template_path, template)
            sync_static_exam_catalog()
        else:
            # Si no se guarda en disco, usar solo el nombre del fichero
            output_path = Path(output_file_name)
            template_stem = Path(output_file_name).stem or "examen"
            template_path = Path(f"{template_stem}-realizado.json")

            with get_connection() as conn:
                upsert_exam(conn, converted_exam, source_path=str(output_path))

        return {
            "success": True,
            "outputPath": str(output_path),
            "templatePath": str(template_path),
            "questionCount": len(converted_exam["questions"]),
            "message": f"Examen generado correctamente. {len(converted_exam['questions'])} preguntas.",
            "examJson": converted_exam,
            "templateJson": template,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }
