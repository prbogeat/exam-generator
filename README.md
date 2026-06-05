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
- **input/** - Directorio con bancos de preguntas por tema

### Temas disponibles
- `psicobiologia/` - Preguntas de Psicobiología
- `emocion/` - Preguntas de Emoción

## Uso

### Con Python

1. Edita la sección `CONFIG` en `generar_examen.py`:
   - `INPUT_JSON` - Ruta del archivo de preguntas de entrada
   - `OUTPUT_JSON` - Ruta donde guardar el examen generado
   - `NUMBER_OF_QUESTIONS` - Cantidad de preguntas (0 = todas)
   - `RANDOM_SELECTION` - Seleccionar al azar o secuencialmente
   - `RANDOM_SEED` - Semilla para reproducibilidad

2. Ejecuta el script:
   ```bash
   python generar_examen.py
   ```

### Con PowerShell

```powershell
./generar-examen.ps1 -InputJson "input/psicobiologia/preguntas_psicologia_fundamentos_psicobiologia_completo.json" `
    -OutputJson "out/examen.json" `
    -SubjectTitle "Fundamentos de Psicobiología" `
    -ExamTitle "UNED - 30 Tipo Test" `
    -Subtitle "30 Tipo Test" `
    -MaxScore 10 `
    -TimeLimitMinutes 90
```

## Configuración del Examen

Los parámetros principales que puedes personalizar son:

- `SUBJECT_TITLE` - Nombre de la asignatura
- `EXAM_TITLE` - Título del examen
- `SUBTITLE` - Subtítulo
- `MAX_SCORE` - Puntuación máxima
- `WRONG_ANSWERS_PER_DISCOUNTED_CORRECT` - Penalización por respuestas incorrectas
- `TIME_LIMIT_MINUTES` - Límite de tiempo en minutos
- `NUMBER_OF_QUESTIONS` - Número de preguntas a incluir
- `RANDOM_SELECTION` - Modo de selección de preguntas
- `RANDOM_SEED` - Semilla para reproducibilidad

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
