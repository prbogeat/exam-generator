# Exam Generator

Proyecto para generar y corregir examenes tipo test en JSON.

## Que incluye

- `generar_examen.py`: genera un examen en formato compatible con `Examen.html`.
- `corregir_examen.py`: corrige un examen realizado contra un examen base y genera informes.
- `Examen.html`: visor/corrector en navegador para examenes JSON.
- `.vscode/tasks.json`: tareas listas para ejecutar en VS Code.

## Estructura recomendada

```text
input/
  psicobiologia/               # bancos o examenes base
  emocion/                     # bancos o examenes base
  examenes_realizados/         # respuestas del alumno
out/
  psicobiologia/               # examenes generados
  emocion/                     # examenes generados
  informes/                    # informes de correccion
```

## 1) Generar examen (`generar_examen.py`)

Edita la seccion `CONFIG` del script y ejecuta.

### Opciones de CONFIG

- `INPUT_JSON`: origen de preguntas.
- `OUTPUT_JSON`: destino del examen generado.
- `SUBJECT_TITLE`, `EXAM_TITLE`, `SUBTITLE`, `NOTICE`: metadatos visibles.
- `MAX_SCORE`: nota maxima.
- `WRONG_ANSWERS_PER_DISCOUNTED_CORRECT`: penalizacion.
- `TIME_LIMIT_MINUTES`: tiempo oficial.
- `FORMULA_TIP`: formula mostrada (vacio = autogenerada).
- `NUMBER_OF_QUESTIONS`: `0` usa todas.
- `RANDOM_SELECTION`: seleccion aleatoria si/no.
- `RANDOM_SEED`: semilla para reproducibilidad (`None` = variable).

### Ejecucion

```bash
python generar_examen.py
```

## 2) Corregir examen (`corregir_examen.py`)

Acepta un examen realizado y un examen base (normalmente de `out/`) para comparar respuestas.

### Formato esperado del examen realizado

```json
{
  "subject": "Asignatura",
  "type": "Convocatoria o tipo",
  "date": "2026-06-10",
  "description": "Descripcion libre",
  "questions": [
    { "id": 1, "text": "...", "marked_option": "A" }
  ]
}
```

Claves aceptadas para la respuesta marcada: `marked_option`, `markedOption`, `selected_option`, `selectedOption`, `answer`, `respuesta`.

### CONFIG por defecto en `corregir_examen.py`

- `DEFAULT_EXAM_INPUT`
- `DEFAULT_CORRECTION_FILE`
- `DEFAULT_OUTPUT_DIR`
- `DEFAULT_OUTPUT_PREFIX`

### Ejecucion con parametros

```bash
python corregir_examen.py \
  --exam-input "input/examenes_realizados/mi-examen.json" \
  --correction-file "out/psicobiologia/examen-junio-2026-realizado.json" \
  --output-dir "out/informes" \
  --output-prefix "correccion"
```

### Ejecucion sin parametros

```bash
python corregir_examen.py
```

Usa los defaults de `CONFIG`.

### Salida de correccion

Por cada ejecucion genera:

- `out/informes/<prefijo>-<nombre_examen>.json`
- `out/informes/<prefijo>-<nombre_examen>.md`

Incluye: aciertos, fallos, en blanco, invalidas, no encontradas, nota y detalle por pregunta con explicacion.

## 3) Uso web (`Examen.html`)

- Boton `Cargar JSON por defecto`: intenta cargar `examen-plantilla.json`.
- Boton `Cargar otro JSON`: carga un archivo local manualmente.

Si abres `Examen.html` con `file://`, los navegadores pueden bloquear `fetch` del JSON por defecto.
Solucion: abrir con servidor HTTP local.

```bash
python -m http.server 8000
```

Luego abrir: `http://localhost:8000/Examen.html`

## 4) Tareas de VS Code

En `Terminal > Run Task` tienes:

- `Levantar servidor HTTP`
- `Generar examen (Python)`
- `Corregir examen (Python)`

Las dos tareas de Python usan `C:/Program Files/Python39-33/python.exe` en modo `process` para evitar problemas de comillas/rutas con espacios en Windows.
