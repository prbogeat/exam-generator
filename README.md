# Generador de Exámenes

Un script para generar exámenes en formato JSON a partir de bancos de preguntas.

## Descripción

Este proyecto contiene herramientas para:
- Procesar preguntas de archivos JSON
- Generar exámenes con selección aleatoria o secuencial
- Formatear la salida en un JSON compatible con `examen-plantilla.json`
- Crear archivos HTML para visualizar los exámenes

## Características

- 📋 Soporte para múltiples formatos de entrada JSON
- 🎲 Selección aleatoria o secuencial de preguntas
- ⚙️ Configuración personalizable (número de preguntas, límite de tiempo, puntuación, etc.)
- 📊 Cálculo automático de fórmulas de puntuación
- 🌐 Generación de HTML para visualización en navegador
- 🔄 Conversión de opciones entre diferentes formatos

## Archivos

- **generar_examen.py** - Script principal en Python
- **generar-examen.ps1** - Script alternativo en PowerShell
- **examen-plantilla.json** - Plantilla de estructura del examen
- **Examen.html** - Plantilla HTML para visualizar exámenes
- **input/** - Directorio con bancos de preguntas y exámenes de referencia

### Estructura de input/

```
input/
├── psicobiologia/
│   ├── preguntas_psicologia_fundamentos_psicobiologia_completo.json (70 preguntas únicas)
│   ├── preguntas_psicologia_emocion_limpio.json
│   ├── preguntas_psicologia_emocion_uned.json
│   ├── Examen-Junio-A-2025.json (30 preguntas)
│   ├── Examen-Junio-C-2025.json (30 preguntas)
│   ├── Examen-Junio-E-2025.json (30 preguntas)
│   ├── Examen-Junio-A-2026.json (30 preguntas)
│   ├── Examen-Junio-B-2026.json (30 preguntas)
│   ├── Examen-Junio-C-2026.json (30 preguntas)
│   └── examenes 2025.json (archivo fuente con múltiples exámenes)
└── emocion/
    └── (archivos de preguntas sobre emoción)
```

### Bancos de preguntas
- `psicobiologia/` - 70 preguntas únicas de Psicobiología (limpiadas y deduplicadas)
- `emocion/` - Preguntas de Emoción

### Exámenes de referencia
- **Exámenes 2025**: Tipos A, C, E (extraídos de `examenes 2025.json`)
- **Exámenes 2026**: Tipos A, B, C (plantillas de referencia)

## Parámetros

### Python (`generar_examen.py`)

Edita estos valores en la sección `CONFIG`:

| Parámetro | Tipo | Valor por defecto | Descripción |
|-----------|------|-------------------|-------------|
| `INPUT_JSON` | str | - | Ruta del archivo JSON de entrada con preguntas |
| `OUTPUT_JSON` | str | - | Ruta donde guardar el examen generado |
| `SUBJECT_TITLE` | str | - | Nombre de la asignatura |
| `EXAM_TITLE` | str | - | Título del examen |
| `SUBTITLE` | str | "" | Subtítulo del examen |
| `NOTICE` | str | "" | Texto de aviso para el examen |
| `MAX_SCORE` | float | 10.0 | Puntuación máxima del examen |
| `WRONG_ANSWERS_PER_DISCOUNTED_CORRECT` | float | 3.0 | Penalización por respuesta incorrecta |
| `TIME_LIMIT_MINUTES` | int | 90 | Límite de tiempo en minutos |
| `FORMULA_TIP` | str | "" | Pista de fórmula (autogenera si está vacío) |
| `NUMBER_OF_QUESTIONS` | int | 0 | Cantidad de preguntas (0 = todas del archivo) |
| `RANDOM_SELECTION` | bool | False | True para selección aleatoria, False para secuencial |
| `RANDOM_SEED` | int/None | None | Semilla para reproducibilidad (None = diferente cada vez) |

### PowerShell (`generar-examen.ps1`)

Parámetros de línea de comandos:

| Parámetro | Tipo | Obligatorio | Valor por defecto | Descripción |
|-----------|------|-------------|-------------------|-------------|
| `InputJson` | string | Sí | - | Ruta del archivo JSON de entrada |
| `OutputJson` | string | Sí | - | Ruta del archivo JSON de salida |
| `SubjectTitle` | string | Sí | - | Nombre de la asignatura |
| `ExamTitle` | string | Sí | - | Título del examen |
| `Subtitle` | string | No | "" | Subtítulo del examen |
| `Notice` | string | No | "" | Texto de aviso |
| `MaxScore` | double | No | 10 | Puntuación máxima |
| `WrongAnswersPerDiscountedCorrect` | double | No | 0 | Penalización por incorrecta |
| `TimeLimitMinutes` | int | No | 90 | Límite de tiempo (minutos) |
| `FormulaTip` | string | No | "" | Pista de fórmula |
| `NumberOfQuestions` | int | No | 0 | Cantidad de preguntas (0 = todas) |
| `RandomSelection` | object | No | false | 1/true para aleatorio, 0/false para secuencial |
| `RandomSeed` | int | No | -1 | Semilla (-1 = diferente cada ejecución) |

## Uso

### Con Python

1. Edita la sección `CONFIG` en `generar_examen.py` con los parámetros

2. Ejecuta el script:
   ```bash
   python generar_examen.py
   ```

### Con PowerShell

```powershell
./generar-examen.ps1 `
    -InputJson "input/psicobiologia/preguntas_psicologia_fundamentos_psicobiologia_completo.json" `
    -OutputJson "out/examen.json" `
    -SubjectTitle "Fundamentos de Psicobiología" `
    -ExamTitle "UNED - 30 Tipo Test" `
    -Subtitle "30 Tipo Test" `
    -Notice "Examen de ejemplo" `
    -MaxScore 10 `
    -WrongAnswersPerDiscountedCorrect 3 `
    -TimeLimitMinutes 90 `
    -NumberOfQuestions 30 `
    -RandomSelection 1 `
    -RandomSeed -1
```

## Formato de Entrada

El script soporta dos formatos de entrada:

### Formato 1: Array directo
```json
[
  {
    "pregunta": "¿Pregunta?",
    "opciones": {"A": "Opción A", "B": "Opción B"},
    "correcta": "A",
    "explicacion": "Explicación..."
  }
]
```

### Formato 2: Objeto con propiedad questions
```json
{
  "questions": [
    { ... }
  ]
}
```

## Salida

El script genera un archivo JSON con la estructura del examen en `out/` que contiene:
- Metadatos del examen
- Lista de preguntas formateadas
- Opciones de respuesta ordenadas
- Información de puntuación y tiempo
