"""
Corrige un examen realizado comparandolo con un examen generado en formato out.

Uso:
  python corregir_examen.py \
    --exam-input input/examenes_realizados/mi_examen_realizado.json \
    --correction-file out/psicobiologia/examen-junio-2026-realizado.json

Tambien puedes ejecutar sin parametros y usar los valores por defecto
definidos en la seccion CONFIG.

Salida:
  - JSON con detalle de correccion
  - Markdown con informe legible
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, cast


# ============================
# CONFIG (edita estos valores)
# ============================
DEFAULT_EXAM_INPUT = "input/examenes_realizados/psicobiologia-parcial 2-junio-2026.json"
DEFAULT_CORRECTION_FILE = "out/psicobiologia/examen-junio-2026-realizado.json"
DEFAULT_OUTPUT_DIR = "out/informes"
DEFAULT_OUTPUT_PREFIX = "informe"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def save_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def save_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write(content)


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split()).lower()


def normalize_option(value: Any) -> str:
    return str(value or "").strip().upper()


def get_exam_questions(exam_root: Any) -> List[Dict[str, Any]]:
    if not isinstance(exam_root, dict):
        raise ValueError("El examen realizado debe ser un objeto JSON con metadatos y 'questions'.")

    questions = exam_root.get("questions")
    if not isinstance(questions, list):
        raise ValueError("El examen realizado debe incluir la lista 'questions'.")

    return questions


def get_correction_questions(correction_root: Any) -> List[Dict[str, Any]]:
    if not isinstance(correction_root, dict):
        raise ValueError("El fichero de correccion debe ser un objeto JSON con la clave 'questions'.")

    questions = correction_root.get("questions")
    if not isinstance(questions, list):
        raise ValueError("El fichero de correccion debe incluir la lista 'questions'.")

    return questions


def get_marked_option(question: Dict[str, Any]) -> str:
    possible_keys = [
        "marked_option",
        "markedOption",
        "selected_option",
        "selectedOption",
        "answer",
        "respuesta",
    ]
    for key in possible_keys:
        if key in question:
            return normalize_option(question.get(key))
    return ""


def option_text(options: List[Dict[str, Any]], key: str) -> str:
    for option in options:
        if normalize_option(option.get("key")) == key:
            return str(option.get("text", ""))
    return ""


def build_correction_indexes(correction_questions: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    by_source_id: Dict[str, Dict[str, Any]] = {}
    by_text: Dict[str, Dict[str, Any]] = {}

    for question in correction_questions:
        qid = str(question.get("id", "")).strip()
        source_id = str(question.get("sourceId", "")).strip()
        text = normalize_text(question.get("text", ""))

        if qid:
            by_id[qid] = question
        if source_id:
            by_source_id[source_id] = question
        if text:
            by_text[text] = question

    return {"by_id": by_id, "by_source_id": by_source_id, "by_text": by_text}


def find_matching_correction_question(
    exam_question: Dict[str, Any], indexes: Dict[str, Dict[str, Dict[str, Any]]]
) -> Optional[Dict[str, Any]]:
    exam_qid = str(exam_question.get("id", "")).strip()
    exam_text = normalize_text(exam_question.get("text", exam_question.get("pregunta", "")))

    if exam_qid and exam_qid in indexes["by_id"]:
        return indexes["by_id"][exam_qid]

    if exam_qid and exam_qid in indexes["by_source_id"]:
        return indexes["by_source_id"][exam_qid]

    if exam_text and exam_text in indexes["by_text"]:
        return indexes["by_text"][exam_text]

    return None


def build_markdown_report(report: Dict[str, Any]) -> str:
    meta = report["meta"]
    stats = report["stats"]
    scoring = report["scoring"]
    details = report["details"]

    lines: List[str] = []
    lines.append(f"# Informe de correccion: {meta['exam_file']}")
    lines.append("")
    lines.append("## Resumen")
    lines.append(f"- Asignatura: {meta.get('subject', '')}")
    lines.append(f"- Tipo: {meta.get('type', '')}")
    lines.append(f"- Fecha: {meta.get('date', '')}")
    lines.append(f"- Descripcion: {meta.get('description', '')}")
    lines.append(f"- Fichero de correccion: {meta.get('correction_file', '')}")
    lines.append("")
    lines.append("## Resultados")
    lines.append(f"- Preguntas en examen realizado: {stats['total_exam_questions']}")
    lines.append(f"- Preguntas cotejadas: {stats['matched_questions']}")
    lines.append(f"- Aciertos: {stats['correct']}")
    lines.append(f"- Fallos: {stats['wrong']}")
    lines.append(f"- En blanco: {stats['blank']}")
    lines.append(f"- Opcion invalida: {stats['invalid_option']}")
    lines.append(f"- Sin correspondencia: {stats['not_found_in_correction']}")
    lines.append(f"- Porcentaje de acierto (sobre cotejadas): {stats['accuracy_percent']:.2f}%")
    lines.append(f"- Nota estimada: {scoring['estimated_score']:.2f}/{scoring['max_score']:.2f}")
    lines.append(f"- Formula aplicada: {scoring['formula_used']}")
    lines.append("")
    lines.append("## Detalle por pregunta")

    for item in details:
        lines.append("")
        lines.append(f"### Pregunta {item['exam_question_id']}")
        lines.append(f"- Estado: {item['status']}")
        lines.append(f"- Enunciado: {item['question_text']}")
        lines.append(f"- Marcada: {item['marked_option'] or '(en blanco)'}")
        lines.append(f"- Texto marcada: {item['marked_option_text'] or '-'}")
        lines.append(f"- Correcta: {item['correct_option'] or '-'}")
        lines.append(f"- Texto correcta: {item['correct_option_text'] or '-'}")
        lines.append(f"- Explicacion: {item['explanation'] or 'No disponible'}")

    return "\n".join(lines) + "\n"


def correct_exam(exam_root: Dict[str, Any], correction_root: Dict[str, Any]) -> Dict[str, Any]:
    exam_questions = get_exam_questions(exam_root)
    correction_questions = get_correction_questions(correction_root)
    indexes = build_correction_indexes(correction_questions)

    details: List[Dict[str, Any]] = []

    matched = 0
    correct = 0
    wrong = 0
    blank = 0
    invalid_option = 0
    not_found = 0

    for exam_question in exam_questions:
        match = find_matching_correction_question(exam_question, indexes)
        exam_qid = str(exam_question.get("id", "")).strip()
        question_text = str(exam_question.get("text", exam_question.get("pregunta", ""))).strip()
        marked = get_marked_option(exam_question)

        if not match:
            not_found += 1
            details.append(
                {
                    "exam_question_id": exam_qid,
                    "matched_correction_id": "",
                    "question_text": question_text,
                    "status": "not_found_in_correction",
                    "marked_option": marked,
                    "marked_option_text": "",
                    "correct_option": "",
                    "correct_option_text": "",
                    "explanation": "No se encontro la pregunta equivalente en el fichero de correccion.",
                }
            )
            continue

        matched += 1
        correction_id = str(match.get("id", "")).strip()
        raw_options = match.get("options")
        options: List[Dict[str, Any]] = cast(List[Dict[str, Any]], raw_options) if isinstance(raw_options, list) else []
        correct_option = normalize_option(match.get("correctOption"))
        explanation = str(match.get("explanation", ""))

        status = ""
        if not marked:
            status = "blank"
            blank += 1
        elif marked not in {normalize_option(opt.get("key")) for opt in options}:
            status = "invalid_option"
            invalid_option += 1
        elif marked == correct_option:
            status = "correct"
            correct += 1
        else:
            status = "wrong"
            wrong += 1

        details.append(
            {
                "exam_question_id": exam_qid,
                "matched_correction_id": correction_id,
                "question_text": question_text or str(match.get("text", "")).strip(),
                "status": status,
                "marked_option": marked,
                "marked_option_text": option_text(options, marked),
                "correct_option": correct_option,
                "correct_option_text": option_text(options, correct_option),
                "explanation": explanation,
            }
        )

    raw_scoring_cfg = correction_root.get("scoring")
    scoring_cfg: Dict[str, Any] = cast(Dict[str, Any], raw_scoring_cfg) if isinstance(raw_scoring_cfg, dict) else {}
    max_score = float(scoring_cfg.get("maxScore", 10.0))
    penalty = float(scoring_cfg.get("wrongAnswersPerDiscountedCorrect", 0.0))
    total_questions_for_grade = int(correction_root.get("totalQuestions") or len(correction_questions) or 0)

    raw = float(correct)
    if penalty > 0:
        raw -= float(wrong) / penalty

    if total_questions_for_grade > 0:
        estimated_score = (raw / total_questions_for_grade) * max_score
    else:
        estimated_score = 0.0

    estimated_score = max(0.0, min(max_score, estimated_score))

    formula_from_exam = str(scoring_cfg.get("formulaTip", "")).strip()
    if formula_from_exam:
        formula_used = formula_from_exam
    elif penalty > 0 and total_questions_for_grade > 0:
        formula_used = f"[(A - E / {penalty:g}) / {total_questions_for_grade}] x {max_score:g}"
    elif total_questions_for_grade > 0:
        formula_used = f"[A / {total_questions_for_grade}] x {max_score:g}"
    else:
        formula_used = "No disponible"

    accuracy_percent = (correct / matched * 100.0) if matched > 0 else 0.0

    return {
        "meta": {
            "subject": str(exam_root.get("subject", exam_root.get("asignatura", ""))),
            "type": str(exam_root.get("type", exam_root.get("tipo", ""))),
            "date": str(exam_root.get("date", exam_root.get("fecha", ""))),
            "description": str(exam_root.get("description", exam_root.get("descripcion", ""))),
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "exam_file": "",
            "correction_file": "",
        },
        "stats": {
            "total_exam_questions": len(exam_questions),
            "matched_questions": matched,
            "correct": correct,
            "wrong": wrong,
            "blank": blank,
            "invalid_option": invalid_option,
            "not_found_in_correction": not_found,
            "accuracy_percent": accuracy_percent,
        },
        "scoring": {
            "estimated_score": estimated_score,
            "max_score": max_score,
            "formula_used": formula_used,
        },
        "details": details,
    }


def build_output_paths(output_dir: Path, exam_input: Path, output_prefix: str) -> Dict[str, Path]:
    stem = exam_input.stem
    prefix = output_prefix.strip() if output_prefix else "informe"
    base_name = f"{prefix}-{stem}"

    json_path = output_dir / f"{base_name}.json"
    md_path = output_dir / f"{base_name}.md"

    return {"json": json_path, "md": md_path}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Corrige un examen realizado comparando marked_option contra un fichero de correccion "
            "en formato de examen generado (carpeta out)."
        )
    )
    parser.add_argument(
        "--exam-input",
        default=DEFAULT_EXAM_INPUT,
        help=(
            "Ruta del examen realizado (idealmente en input/examenes_realizados). "
            f"Por defecto: {DEFAULT_EXAM_INPUT}"
        ),
    )
    parser.add_argument(
        "--correction-file",
        default=DEFAULT_CORRECTION_FILE,
        help=f"Ruta del examen de correccion en formato out. Por defecto: {DEFAULT_CORRECTION_FILE}",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Directorio para guardar los informes de salida.",
    )
    parser.add_argument(
        "--output-prefix",
        default=DEFAULT_OUTPUT_PREFIX,
        help="Prefijo para el nombre de los informes generados.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    script_dir = Path(__file__).resolve().parent
    exam_input_path = (script_dir / args.exam_input).resolve()
    correction_file_path = (script_dir / args.correction_file).resolve()
    output_dir = (script_dir / args.output_dir).resolve()

    if not exam_input_path.exists():
        raise FileNotFoundError(f"No existe el examen realizado: {exam_input_path}")
    if not correction_file_path.exists():
        raise FileNotFoundError(f"No existe el fichero de correccion: {correction_file_path}")

    exam_root = load_json(exam_input_path)
    correction_root = load_json(correction_file_path)

    report = correct_exam(exam_root, correction_root)
    report["meta"]["exam_file"] = str(exam_input_path)
    report["meta"]["correction_file"] = str(correction_file_path)

    output_paths = build_output_paths(output_dir, exam_input_path, args.output_prefix)
    save_json(output_paths["json"], report)
    save_text(output_paths["md"], build_markdown_report(report))

    print(f"Informe JSON generado en: {output_paths['json']}")
    print(f"Informe Markdown generado en: {output_paths['md']}")
    print(
        "Resumen: "
        f"Aciertos={report['stats']['correct']}, "
        f"Fallos={report['stats']['wrong']}, "
        f"Blanco={report['stats']['blank']}, "
        f"Nota={report['scoring']['estimated_score']:.2f}/{report['scoring']['max_score']:.2f}"
    )


if __name__ == "__main__":
    main()
