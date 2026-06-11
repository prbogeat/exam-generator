# Exam Generator

Proyecto para generar y corregir examenes tipo test en JSON.

## Que incluye

- `generar_examen.py`: genera un examen en formato compatible con la app web de `docs/`.
- `corregir_examen.py`: corrige un examen realizado contra un examen base y genera informes.
- `docs/index.html`: visor/corrector en navegador para examenes JSON.
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
- `GENERATE_TEMPLATE`: si es `True`, genera una plantilla de examen realizado para poder corregir despues.
- `TEMPLATE_OUTPUT_PATH`: ruta de salida de esa plantilla (`""` = ruta derivada automaticamente desde `OUTPUT_JSON`).

### Ejecucion

```bash
python generar_examen.py
```

### Salida para correccion (plantilla de examen realizado)

Si `GENERATE_TEMPLATE = True`, ademas del examen en `out/`, se genera un JSON de plantilla en `input/examenes_realizados/...` con `marked_option` vacio por pregunta.

Esa plantilla es la base para rellenar respuestas y usar despues `corregir_examen.py`.

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

## Ejemplo completo (fin a fin)

Ejemplo real para `psicobiologia`:

1. En `generar_examen.py`, configura:
  - `INPUT_JSON = "input/banco_de_preguntas/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`
  - `OUTPUT_JSON = "out/examenes/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`
  - `GENERATE_TEMPLATE = True`
  - `TEMPLATE_OUTPUT_PATH = "input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`

2. Genera examen y plantilla:

```bash
python generar_examen.py
```

3. Rellena respuestas del alumno en:

```text
input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json
```

Para cada pregunta, completa `marked_option` con `A`, `B`, `C` o `D` (o dejalo vacio si esta en blanco).

4. Corrige el examen contra el JSON generado en `out/`:

```bash
python corregir_examen.py \
  --exam-input "input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json" \
  --correction-file "out/examenes/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json" \
  --output-dir "out/informes/psicobiologia/Parcial 1" \
  --output-prefix "correccion"
```

5. Revisa los resultados generados:
  - `out/informes/psicobiologia/Parcial 1/correccion-Enero 2026 - Tipo A.json`
  - `out/informes/psicobiologia/Parcial 1/correccion-Enero 2026 - Tipo A.md`

El `.json` sirve para procesado posterior y el `.md` para lectura rapida del informe.

## 3) Uso web (`docs/index.html`)

- Boton `Cargar JSON por defecto`: intenta cargar `data/examen-plantilla.json`.
- Boton `Cargar otro JSON`: carga un archivo local manualmente.

Si abres `docs/index.html` con `file://`, los navegadores pueden bloquear `fetch` del JSON por defecto.
Solucion: abrir con servidor HTTP local.

```bash
python -m http.server 8000
```

Luego abrir: `http://localhost:8000/`

Con la task de VS Code `Levantar servidor HTTP`, la raiz ya es `docs`, por lo que basta abrir:

`http://localhost:8000/`

## 4) Tareas de VS Code

En `Terminal > Run Task` tienes:

- `Levantar servidor HTTP`
- `Generar examen (Python)`
- `Corregir examen (Python)`

Las dos tareas de Python usan `C:/Program Files/Python39-33/python.exe` en modo `process` para evitar problemas de comillas/rutas con espacios en Windows.
