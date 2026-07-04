# Exam Generator

Proyecto para generar y corregir examenes tipo test en JSON, con una interfaz web para realizarlos.

## Que incluye

- `src/generar_examen.py`: genera un examen en formato compatible con la app web de `docs/`.
- `src/corregir_examen.py`: corrige un examen realizado contra un examen base y genera informes.
- `src/generar_examen_lib.py`: lógica reutilizable de generación (usada por `generar_examen.py` y por el servidor).
- `src/exam_db.py`: persistencia local SQLite para exámenes generados.
- `src/import_out_exams_to_db.py`: importador de exámenes JSON existentes (`out/examenes`) hacia SQLite.
- `src/exam_presets.py`: presets compartidos de ruta y configuracion por asignatura.
- `src/server.py`: servidor HTTP local que sirve `docs/` y expone la API de generación.
- `docs/index.html`: visor/corrector en navegador para examenes JSON (apto para GitHub Pages).
- `docs/generator.html`: interfaz web de generación de exámenes, con guardado local opcional incluso si se sirve desde un servidor remoto.
- `docs/notebooklm.html`: flujo local para convertir la salida estructurada de NotebookLM en bancos JSON.
- `docs/manifest.webmanifest` y `docs/sw.js`: configuración PWA para instalación móvil y caché offline básica.
- `docs/data/presets.json`: definición de presets disponibles en la UI del generador.
- `mobile/`: shell Capacitor para empaquetar la web app en iOS/Android con persistencia SQLite nativa.
- `.vscode/tasks.json`: tareas listas para ejecutar en VS Code.

## Estructura del proyecto

```text
src/
  generar_examen.py        # Script de generación
  corregir_examen.py       # Script de corrección
  generar_examen_lib.py    # Librería compartida
  exam_presets.py          # Presets por asignatura
  server.py                # Servidor HTTP local
docs/
  index.html               # Visor de exámenes (GitHub Pages)
  generator.html           # UI de generación (con guardado local opcional)
  notebooklm.html          # UI para convertir la salida de NotebookLM en JSON
  manifest.webmanifest     # Metadatos de instalación (PWA)
  sw.js                    # Service worker (caché básica offline)
  assets/
    css/
    js/
    icons/
  data/
    examen-plantilla.json  # Plantilla por defecto
    presets.json           # Presets para la UI del generador
mobile/
  capacitor.config.json    # Config de Capacitor
  package.json             # Scripts para sync/open iOS/Android
  README.md                # Guía de empaquetado móvil
input/
  banco_de_preguntas/      # JSONs origen de preguntas
  examenes_realizados/     # Respuestas del alumno para corregir
out/
  examenes/                # Exámenes generados
  informes/                # Informes de corrección
```

## Modos de uso

## Base de datos local (SQLite)

Los exámenes generados se guardan ahora en paralelo en JSON y en SQLite:

- Base local: `out/db/exams.db`
- JSON de salida: `out/examenes/...`

Para importar exámenes ya existentes en `out/examenes` a SQLite:

```bash
python src/import_out_exams_to_db.py
```

API de lectura desde base local (cuando ejecutas `python src/server.py`):

- `GET /api/exams` → lista metadatos
- `GET /api/exams/latest` → devuelve el último examen completo
- `GET /api/exams/{exam_uid}` → devuelve un examen específico

La app web (`docs/index.html`) intenta cargar primero `GET /api/exams/latest` y, si no hay backend, usa el JSON por defecto como fallback.

### Opción A: Scripts Python directamente

```bash
python src/generar_examen.py
python src/corregir_examen.py
```

### Opción B: UI web local (con servidor)

Levanta el servidor y accede desde el navegador:

```bash
python src/server.py
```

- `http://localhost:8001/` → Visor de exámenes
- `http://localhost:8001/generator.html` → Generador de exámenes

### Opción C: GitHub Pages

Solo el visor de exámenes (`index.html`) es compatible con GitHub Pages. El generador depende de Python para calcular el examen, pero puede guardar la salida en una carpeta local del navegador cuando se usa desde un servidor remoto.

### Opción D: NotebookLM local

Esta rama añade un flujo nuevo para pegar la salida estructurada de NotebookLM y convertirla en un banco JSON sin usar APIs externas.

Ejecución local:

```bash
python src/server.py
```

Luego abre:

- `http://localhost:8001/notebooklm.html`

Notas importantes:

- No hay integración directa con NotebookLM.
- El flujo soportado es: pedir a NotebookLM que responda en un formato estructurado y pegar esa salida en la página.
- El conversor funciona sin claves API ni billing.

### Opción E: Instalable en iOS/Android (PWA + shell Capacitor)

Esta rama incluye dos caminos complementarios:

- **PWA**: instalable directamente desde navegador móvil (sin tienda).
- **Capacitor**: empaquetado en app nativa para iOS/Android, manteniendo lógica web y con persistencia local en SQLite nativa.

Para PWA, sirve `docs/` por HTTPS o localhost y abre `index.html`.

Para shell móvil:

```bash
cd mobile
npm install
npm run cap:add:ios
npm run cap:add:android
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```

## 1) Generar examen (`src/generar_examen.py`)

Edita la seccion `CONFIG` del script y ejecuta, o usa el preset:

```python
PRESET = "psicobiologia-parcial-1"  # None = usar CONFIG manual
```

### Presets disponibles

Los presets se definen en `src/exam_presets.py` (para los scripts) y en `docs/data/presets.json` (para la UI).

Cada preset incluye: rutas de entrada/salida, metadatos del examen, puntuación máxima, penalización, tiempo y número de preguntas.

La ruta se compone de dos partes:

- raíz general: `input/banco_de_preguntas`
- parte específica del preset: por ejemplo `psicobiologia/Parcial 2/Examen Junio-2024.json`

Lo mismo aplica para `out/examenes` e `input/examenes_realizados`.

### Formato del banco de preguntas

El JSON de entrada puede ser un array directo de preguntas o un objeto con clave `questions`. Campos por pregunta:

| Campo | Alias aceptado | Obligatorio | Descripción |
|---|---|---|---|
| `pregunta` | `text` | Sí | Enunciado |
| `opciones` | `options` | Sí | Respuestas (`{"a": "..."}` o `[{"key": "A", "text": "..."}]`) |
| `correcta` | `correctOption` | Sí | Letra de la opción correcta |
| `explicacion` | `explanation` | No | Texto explicativo mostrado tras corregir |
| `imagen` | `image` | No | URL o ruta de imagen/recurso asociado a la pregunta |

**Campo `imagen`:** campo opcional para preguntas que necesitan un recurso visual (figura, gráfico, esquema…).

```json
{
  "id": 5,
  "tema": "Tema 3: Neuroanatomía",
  "pregunta": "¿Qué estructura señala la flecha A?",
  "imagen": "https://ejemplo.com/figura-3-2.png",
  "opciones": { "a": "Amígdala", "b": "Hipocampo", "c": "Tálamo", "d": "Corteza" },
  "correcta": "b",
  "explicacion": "La flecha señala el hipocampo..."
}
```

El campo se propaga automáticamente al JSON de examen generado (`out/`). Las preguntas sin imagen simplemente no incluyen el campo.

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
python src/generar_examen.py
```

### Salida para correccion (plantilla de examen realizado)

Si `GENERATE_TEMPLATE = True`, ademas del examen en `out/`, se genera un JSON de plantilla en `input/examenes_realizados/...` con `marked_option` vacio por pregunta.

Esa plantilla es la base para rellenar respuestas y usar despues `corregir_examen.py`.

## 2) Corregir examen (`src/corregir_examen.py`)

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

- `PRESET`
- `DEFAULT_EXAM_INPUT`
- `DEFAULT_CORRECTION_FILE`
- `DEFAULT_OUTPUT_DIR`
- `DEFAULT_OUTPUT_PREFIX`

### Ejecucion con parametros

```bash
python src/corregir_examen.py \
  --exam-input "input/examenes_realizados/mi-examen.json" \
  --correction-file "out/psicobiologia/examen-junio-2026-realizado.json" \
  --output-dir "out/informes" \
  --output-prefix "correccion"
```

### Ejecucion sin parametros

```bash
python src/corregir_examen.py
```

Usa los defaults de `CONFIG`.

### Salida de correccion

Por cada ejecucion genera:

- `out/informes/<prefijo>-<nombre_examen>.json`
- `out/informes/<prefijo>-<nombre_examen>.md`

Incluye: aciertos, fallos, en blanco, invalidas, no encontradas, nota y detalle por pregunta con explicacion.

## 3) Servidor local (`src/server.py`)

Servidor HTTP Python puro (sin dependencias externas) que:

- Sirve los archivos de `docs/` en `http://localhost:8001/`
- Expone `POST /api/generate-exam` para generar exámenes desde la UI

```bash
python src/server.py          # Puerto 8001 por defecto
python src/server.py 8080     # Puerto personalizado
```

## Ejemplo completo (fin a fin)

Ejemplo real para `psicobiologia`:

1. En `src/generar_examen.py`, configura:
  - `INPUT_JSON = "input/banco_de_preguntas/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`
  - `OUTPUT_JSON = "out/examenes/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`
  - `GENERATE_TEMPLATE = True`
  - `TEMPLATE_OUTPUT_PATH = "input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json"`

2. Genera examen y plantilla:

```bash
python src/generar_examen.py
```

3. Rellena respuestas del alumno en:

```text
input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json
```

Para cada pregunta, completa `marked_option` con `A`, `B`, `C` o `D` (o dejalo vacio si esta en blanco).

4. Corrige el examen contra el JSON generado en `out/`:

```bash
python src/corregir_examen.py \
  --exam-input "input/examenes_realizados/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json" \
  --correction-file "out/examenes/psicobiologia/Parcial 1/Enero 2026 - Tipo A.json" \
  --output-dir "out/informes/psicobiologia/Parcial 1" \
  --output-prefix "correccion"
```

5. Revisa los resultados generados:
  - `out/informes/psicobiologia/Parcial 1/correccion-Enero 2026 - Tipo A.json`
  - `out/informes/psicobiologia/Parcial 1/correccion-Enero 2026 - Tipo A.md`


## 4) Uso web (`docs/index.html`)

Acciones disponibles en el visor:

- Boton `Cargar JSON por defecto`: intenta cargar `data/examen-plantilla.json`.
- Boton `Cargar examen JSON`: carga un examen generado localmente.
- Boton `Cargar respuestas / realizado`: carga un JSON con `marked_option` y preselecciona respuestas.
- Boton `Guardar respuestas JSON`: descarga un examen realizado con el formato esperado por `src/corregir_examen.py`.

### Imágenes en el visor

Si una pregunta del JSON tiene el campo `image`, el visor lo muestra debajo del enunciado antes de las opciones:

| Valor de `image` | Comportamiento |
|---|---|
| URL que termina en `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` | Se incrusta como imagen (máx. 420 px de alto) |
| Cualquier otra URL (PDF, Drive, etc.) | Se muestra como enlace «📎 Ver recurso adjunto» que abre en nueva pestaña |

Para recursos locales, coloca los archivos en `docs/assets/` y usa una ruta relativa en el JSON:

```json
"image": "assets/images/figura-3.png"
```

Esta ruta funciona cuando el examen se sirve con el servidor HTTP local (`python src/server.py` o la tarea `Levantar servidor HTTP`). En GitHub Pages solo funcionan URLs absolutas.

Notas:

- El enlace a `generator.html` solo se muestra en entornos no estáticos; en GitHub Pages se oculta.
- En GitHub Pages se oculta automáticamente porque el generador requiere backend Python.
- En el generador puedes elegir una carpeta local del navegador para guardar la salida cuando la UI se ejecute en remoto.

Si abres `docs/index.html` con `file://`, los navegadores pueden bloquear `fetch` del JSON por defecto.
Solucion: abrir con servidor HTTP local.

```bash
python -m http.server 8001 --directory docs
```

Luego abrir: `http://localhost:8001/`

## 5) Tareas de VS Code

En `Terminal > Run Task` tienes:

- `Levantar servidor HTTP`
- `Generar examen (Python)`
- `Corregir examen (Python)`
- `Servidor de Generación (Python)`

Resumen de cada task:

- `Levantar servidor HTTP`: sirve `docs/` en `http://localhost:8001/`.
- `Generar examen (Python)`: ejecuta `python src/generar_examen.py`.
- `Corregir examen (Python)`: ejecuta `python src/corregir_examen.py`.
- `Servidor de Generación (Python)`: ejecuta `python src/server.py` para habilitar `generator.html` y `POST /api/generate-exam`.
- `NotebookLM local`: abre `notebooklm.html` y pega la salida estructurada de NotebookLM.

Todas usan `C:/Program Files/Python39-33/python.exe` para evitar problemas de rutas con espacios en Windows.

## 6) Modo móvil en detalle

### PWA (sin empaquetar)

- `docs/index.html` declara `manifest.webmanifest` y soporte iOS (`apple-touch-icon`).
- `docs/sw.js` cachea shell y recursos principales para funcionamiento básico sin conexión.
- Instalación:
  - Android (Chrome): menú > "Instalar app".
  - iOS (Safari): compartir > "Añadir a pantalla de inicio".

### Capacitor (empaquetado App Store / Play Store)

Directorio: `mobile/`.

- `webDir` apunta a `../docs`, así reutilizas exactamente la misma app web.
- No se añade ningún plugin nativo por defecto.
- Tras cambios en `docs/`, ejecuta de nuevo:

```bash
cd mobile
npm run cap:sync
```
