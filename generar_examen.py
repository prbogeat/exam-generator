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


# ============================
# CONFIG (edita estos valores)
# ============================
INPUT_JSON = "input/psicobiologia/Examen Septiembre-2024.json"
OUTPUT_JSON = "out/psicobiologia/examen-septiembre-2024.json"

SUBJECT_TITLE = "Fundamentos de Psicobiología"
EXAM_TITLE = "UNED - Septiembre 2024"
SUBTITLE = "30 Tipo Test"
NOTICE = "Preguntas del examen de Septiembre 2024 - Fundamentos de Psicobiología de la UNED"

MAX_SCORE = 10.0
WRONG_ANSWERS_PER_DISCOUNTED_CORRECT = 3.0
TIME_LIMIT_MINUTES = 90
FORMULA_TIP = ""  # Si se deja vacio, se autogenera.
NUMBER_OF_QUESTIONS = 30  # 0 = usar todas las preguntas del JSON de entrada.
RANDOM_SELECTION = False  # True = elegir preguntas al azar.
RANDOM_SEED = None  # Ejemplo: 1234. En None, el resultado cambia en cada ejecucion.


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
    script_dir = Path(__file__).resolve().parent
    input_path = (script_dir / INPUT_JSON).resolve()
    output_path = (script_dir / OUTPUT_JSON).resolve()

    source_root = load_json(input_path)
    converted_exam = convert_exam(source_root)

    save_json(output_path, converted_exam)

    print(f"Examen generado correctamente en: {output_path}")
    print(f"Preguntas convertidas: {len(converted_exam['questions'])}")


if __name__ == "__main__":
    main()
