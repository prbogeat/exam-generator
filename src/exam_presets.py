"""Presets compartidos para generacion y correccion de examenes."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, Optional

GENERAL_INPUT_ROOT = Path("input/banco_de_preguntas")
GENERAL_OUTPUT_ROOT = Path("out/examenes")
GENERAL_REALIZED_ROOT = Path("input/examenes_realizados")
GENERAL_REPORT_ROOT = Path("out/informes")

SUBJECT_FOLDER_PSICOBIOLOGIA = "Fundamentos de Psicobiología"
SUBJECT_FOLDER_EMOCION = "Psicología de la Emoción"

PRESETS: Dict[str, Dict[str, Any]] = {
    "psicobiologia-parcial-2": {
        "subjectTitle": "Fundamentos de Psicobiología",
        "examTitle": "UNED - Junio 2026",
        "subtitle": "30 Tipo Test - Examen Tipo",
        "notice": "Preguntas del examen de Junio 2026 - Fundamentos de Psicobiología de la UNED - Parcial 2",
        "maxScore": 10.0,
        "wrongAnswersPerDiscountedCorrect": 3.0,
        "timeLimitMinutes": 90,
        "numberOfQuestions": 30,
        "randomSelection": False,
        "input_path_parts": ["psicobiologia", "Parcial 2", "Examen preset.json"],
        "output_path_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 2", "Examen preset.json"],
        "template_path_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 2", "Examen preset-realizado.json"],
        "report_dir_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 2"],
    },
    "psicobiologia-parcial-1": {
        "subjectTitle": "Fundamentos de Psicobiología",
        "examTitle": "UNED - Febrero 2026",
        "subtitle": "30 Tipo Test - Examen Tipo F",
        "notice": "Preguntas del examen de Febrero 2026 - Fundamentos de Psicobiología de la UNED - Parcial 1",
        "maxScore": 10.0,
        "wrongAnswersPerDiscountedCorrect": 3.0,
        "timeLimitMinutes": 90,
        "numberOfQuestions": 30,
        "randomSelection": False,
        "input_path_parts": ["psicobiologia", "Parcial 1", "Febrero 2026 - Tipo F.json"],
        "output_path_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 1", "Febrero 2026 - Tipo F.json"],
        "template_path_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 1", "Febrero 2026 - Tipo F-Realizado.json"],
        "report_dir_parts": [SUBJECT_FOLDER_PSICOBIOLOGIA, "Parcial 1"],
    },
    "emocion": {
        "subjectTitle": "Psicología de la Emoción",
        "examTitle": "UNED - Junio 2026",
        "subtitle": "40 Tipo Test",
        "notice": "Examen de Psicología de la Emoción",
        "maxScore": 10.0,
        "wrongAnswersPerDiscountedCorrect": 1.0,
        "timeLimitMinutes": 90,
        "numberOfQuestions": 40,
        "randomSelection": False,
        "input_path_parts": ["emocion", "preguntas_psicologia_emocion_uned.json"],
        "output_path_parts": [SUBJECT_FOLDER_EMOCION, "examen-emocion.json"],
        "template_path_parts": [SUBJECT_FOLDER_EMOCION, "examen-emocion-realizado.json"],
        "report_dir_parts": [SUBJECT_FOLDER_EMOCION],
    },
}


def get_preset(name: Optional[str]) -> Dict[str, Any]:
    if not name:
        return {}

    return PRESETS.get(name.strip().lower(), {})


def build_path(root: Path, relative_parts: Any) -> Path:
    if not relative_parts:
        return root

    if isinstance(relative_parts, (str, Path)):
        parts: Iterable[Any] = [relative_parts]
    else:
        parts = relative_parts

    path = root
    for part in parts:
        if part in (None, ""):
            continue
        path = path / str(part)

    return path
