"""
Generador de examen en formato compatible con examen-plantilla.json.

Uso desde IDE:
1) Edita los valores en la seccion CONFIG.
2) Ejecuta este script.
3) Se generara el JSON de salida indicado.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, List

from exam_presets import GENERAL_INPUT_ROOT, GENERAL_OUTPUT_ROOT, GENERAL_REALIZED_ROOT, build_path, get_preset
from exam_db import get_connection, upsert_exam
from static_exam_catalog import sync_static_exam_catalog

# PRESETS
# Configuraciones predefinidas según la asignatura o tipo de examen. Si se define una PRESET, se ignoran los valores individuales de CONFIG.
PRESET = "psicobiologia-parcial-1"  # None = usar CONFIG manual.
# ============================
# CONFIG (edita estos valores)
# ============================
DEFAULT_INPUT_JSON = "input/banco_de_preguntas/default/Preguntas-default.json"
DEFAULT_OUTPUT_JSON = "out/examenes/default/Examen-default.json"

DEFAULT_SUBJECT_TITLE = "Asignatura sin definir"
DEFAULT_EXAM_TITLE = "Examen UNED"
DEFAULT_SUBTITLE = "Tipo Test - Examen"
DEFAULT_NOTICE = "Preguntas del examen - UNED"

DEFAULT_MAX_SCORE = 10.0
DEFAULT_WRONG_ANSWERS_PER_DISCOUNTED_CORRECT = 3.0
DEFAULT_TIME_LIMIT_MINUTES = 90
DEFAULT_FORMULA_TIP = ""  # Si se deja vacio, se autogenera.
DEFAULT_NUMBER_OF_QUESTIONS = 30  # 0 = usar todas las preguntas del JSON de entrada.
DEFAULT_RANDOM_SELECTION = False  # True = elegir preguntas al azar.
RANDOM_SEED = None  # Ejemplo: 1234. En None, el resultado cambia en cada ejecucion.

# Plantilla de examen realizado
# True = generar tambien una plantilla vacia en input/examenes_realizados/<subject>/ para rellenar y corregir.
GENERATE_TEMPLATE = True
# Ruta de salida de la plantilla. Si se deja vacio, se deriva automaticamente del OUTPUT_JSON.
DEFAULT_TEMPLATE_OUTPUT_PATH = "input/examenes_realizados/default/Examen-default.json"  # Ejemplo: "input/examenes_realizados/default/mi-plantilla.json"

PRESET_CONFIG = get_preset(PRESET)

if PRESET_CONFIG:
    INPUT_JSON = str(build_path(GENERAL_INPUT_ROOT, PRESET_CONFIG.get("input_path_parts")))
    OUTPUT_JSON = str(build_path(GENERAL_OUTPUT_ROOT, PRESET_CONFIG.get("output_path_parts")))
    SUBJECT_TITLE = str(PRESET_CONFIG.get("subjectTitle", DEFAULT_SUBJECT_TITLE))
    EXAM_TITLE = str(PRESET_CONFIG.get("examTitle", DEFAULT_EXAM_TITLE))
    SUBTITLE = str(PRESET_CONFIG.get("subtitle", DEFAULT_SUBTITLE))
    NOTICE = str(PRESET_CONFIG.get("notice", DEFAULT_NOTICE))
    MAX_SCORE = float(PRESET_CONFIG.get("maxScore", DEFAULT_MAX_SCORE))
    WRONG_ANSWERS_PER_DISCOUNTED_CORRECT = float(
        PRESET_CONFIG.get("wrongAnswersPerDiscountedCorrect", DEFAULT_WRONG_ANSWERS_PER_DISCOUNTED_CORRECT)
    )
    TIME_LIMIT_MINUTES = int(PRESET_CONFIG.get("timeLimitMinutes", DEFAULT_TIME_LIMIT_MINUTES))
    FORMULA_TIP = str(PRESET_CONFIG.get("formulaTip", DEFAULT_FORMULA_TIP))
    NUMBER_OF_QUESTIONS = int(PRESET_CONFIG.get("numberOfQuestions", DEFAULT_NUMBER_OF_QUESTIONS))
    RANDOM_SELECTION = bool(PRESET_CONFIG.get("randomSelection", DEFAULT_RANDOM_SELECTION))
    TEMPLATE_OUTPUT_PATH = str(build_path(GENERAL_REALIZED_ROOT, PRESET_CONFIG.get("template_path_parts")))
else:
    INPUT_JSON = DEFAULT_INPUT_JSON
    OUTPUT_JSON = DEFAULT_OUTPUT_JSON
    SUBJECT_TITLE = DEFAULT_SUBJECT_TITLE
    EXAM_TITLE = DEFAULT_EXAM_TITLE
    SUBTITLE = DEFAULT_SUBTITLE
    NOTICE = DEFAULT_NOTICE
    MAX_SCORE = DEFAULT_MAX_SCORE
    WRONG_ANSWERS_PER_DISCOUNTED_CORRECT = DEFAULT_WRONG_ANSWERS_PER_DISCOUNTED_CORRECT
    TIME_LIMIT_MINUTES = DEFAULT_TIME_LIMIT_MINUTES
    FORMULA_TIP = DEFAULT_FORMULA_TIP
    NUMBER_OF_QUESTIONS = DEFAULT_NUMBER_OF_QUESTIONS
    RANDOM_SELECTION = DEFAULT_RANDOM_SELECTION
    TEMPLATE_OUTPUT_PATH = DEFAULT_TEMPLATE_OUTPUT_PATH


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


def derive_template_path(output_path: Path, script_dir: Path) -> Path:
    """Deriva la ruta de la plantilla a partir del path de salida del examen generado.

    Ejemplo: out/examenes/Fundamentos de Psicobiología/examen.json
             → input/examenes_realizados/Fundamentos de Psicobiología/examen.json
    """
    subject = output_path.parent.name
    return script_dir / "input" / "examenes_realizados" / subject / output_path.name


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


def convert_exam(source_root: Any) -> Dict[str, Any]:
    source_questions = list(get_source_questions(source_root))

    rng = random.Random(RANDOM_SEED)

    if NUMBER_OF_QUESTIONS < 0:
        raise ValueError("NUMBER_OF_QUESTIONS no puede ser negativo.")

    if NUMBER_OF_QUESTIONS > 0:
        if NUMBER_OF_QUESTIONS > len(source_questions):
            raise ValueError(
                "NUMBER_OF_QUESTIONS no puede ser mayor que las preguntas disponibles "
                f"({len(source_questions)})."
            )
        if RANDOM_SELECTION:
            source_questions = rng.sample(source_questions, NUMBER_OF_QUESTIONS)
        else:
            source_questions = source_questions[:NUMBER_OF_QUESTIONS]
    elif RANDOM_SELECTION:
        rng.shuffle(source_questions)

    converted_questions: List[Dict[str, Any]] = []

    for index, question in enumerate(source_questions, start=1):
        source_id = safe_int(question.get("id"), index)
        text = question_text(question)
        options = convert_options(question)
        correct_option = question_correct_option(question)
        explanation = question_explanation(question)

        if not text:
            raise ValueError(f"La pregunta con id '{source_id}' no tiene texto (pregunta/text).")

        if len(options) < 2:
            raise ValueError(f"La pregunta con id '{source_id}' debe tener al menos 2 opciones.")

        option_keys = {opt["key"] for opt in options}
        if correct_option and correct_option not in option_keys:
            raise ValueError(
                f"La pregunta con id '{source_id}' tiene correctOption '{correct_option}' que no existe en opciones."
            )

        converted_questions.append(
            {
                "id": index,
                "sourceId": source_id,
                "used": True,
                "text": text,
                "options": options,
                "correctOption": correct_option,
                "explanation": explanation,
            }
        )

    question_count = len(converted_questions)
    final_formula_tip = FORMULA_TIP.strip() or default_formula_tip(
        WRONG_ANSWERS_PER_DISCOUNTED_CORRECT,
        question_count,
        MAX_SCORE,
    )

    return {
        "subjectTitle": SUBJECT_TITLE,
        "examTitle": EXAM_TITLE,
        "subtitle": SUBTITLE,
        "totalQuestions": question_count,
        "notice": NOTICE,
        "scoring": {
            "maxScore": MAX_SCORE,
            "wrongAnswersPerDiscountedCorrect": WRONG_ANSWERS_PER_DISCOUNTED_CORRECT,
            "formulaTip": final_formula_tip,
            "timeLimitMinutes": TIME_LIMIT_MINUTES,
        },
        "questions": converted_questions,
    }


def main() -> None:
    script_dir = Path(__file__).resolve().parent.parent  # raíz del proyecto (un nivel arriba de src/)
    input_path = (script_dir / INPUT_JSON).resolve()
    output_path = (script_dir / OUTPUT_JSON).resolve()

    source_root = load_json(input_path)
    converted_exam = convert_exam(source_root)

    save_json(output_path, converted_exam)

    with get_connection() as conn:
        upsert_exam(conn, converted_exam, source_path=str(output_path))

    print(f"Examen generado correctamente en: {output_path}")
    print(f"Preguntas convertidas: {len(converted_exam['questions'])}")

    if GENERATE_TEMPLATE:
        if TEMPLATE_OUTPUT_PATH.strip():
            template_path = (script_dir / TEMPLATE_OUTPUT_PATH).resolve()
        else:
            template_path = derive_template_path(output_path, script_dir)
        template = build_realized_template(converted_exam)
        save_json(template_path, template)
        print(f"Plantilla de examen realizado generada en: {template_path}")

    static_catalog = sync_static_exam_catalog()
    print(
        "Catálogo estático actualizado en: "
        f"{static_catalog['indexPath']} ({static_catalog['count']} examen(es))"
    )


if __name__ == "__main__":
    main()
