# Exam Generator

Proyecto para generar y corregir examenes tipo test en JSON, con una interfaz web para realizarlos.

## Que incluye

- `src/generar_examen.py`: genera un examen en formato compatible con la app web de `docs/`.
- `src/corregir_examen.py`: corrige un examen realizado contra un examen base y genera informes.
- `src/generar_examen_lib.py`: lógica reutilizable de generación (usada por `generar_examen.py` y por el servidor).
- `src/static_exam_catalog.py`: copia los exámenes públicos de `out/examenes` a `docs/assets/json` y genera el índice maestro estático.
- `src/normalize_out_exam_metadata.py`: normaliza metadatos históricos de los exámenes públicos en `out/examenes`.
- `src/exam_db.py`: persistencia de exámenes en SQLite o PostgreSQL (según configuración).
- `src/import_out_exams_to_db.py`: importador de exámenes JSON existentes (`out/examenes`) hacia la BD activa.
- `src/init_postgres_schema.py`: inicializador del esquema SQL en PostgreSQL.
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
    json/
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

## Uso actual

La app tiene ahora 4 flujos principales:

1. Ver y hacer examenes publicados desde el catalogo estatico.
2. Generar examenes desde bancos JSON con Python o con la UI web.
3. Convertir salida de NotebookLM a banco JSON.
4. Corregir examenes realizados y generar informes.

La idea importante es esta:

- La parte publica ya no depende del backend para listar examenes.
- El visor carga un indice estatico en `docs/assets/json/exams-index.json`.
- Cada examen publicado vive en `docs/assets/json/exams/...`.
- Los JSON de trabajo se siguen generando en `out/examenes/...`.

## Flujo rapido segun lo que quieras hacer

### Quiero solo ver o hacer examenes publicados

Abre el visor:

- `docs/index.html` si ya estas sirviendo `docs/`
- o `http://localhost:8001/` si levantas un servidor local

El visor:

- carga el catalogo publicado desde `docs/assets/json/exams-index.json`
- permite filtrar por asignatura, parcial y examen
- permite cargar un JSON local manualmente
- permite cargar respuestas realizadas
- permite guardar las respuestas en JSON

Si no encuentra catalogo, usa `docs/data/examen-plantilla.json` como fallback.

### Quiero generar un examen clasico desde un banco JSON

Tienes dos opciones.

#### Opcion 1. Script Python

```bash
python src/generar_examen.py
```

Este flujo:

- lee el banco configurado en el script o en el preset
- genera el examen en `out/examenes/...`
- puede generar una plantilla en `input/examenes_realizados/...`
- actualiza automaticamente el catalogo estatico publico

#### Opcion 2. UI web del generador

Abre:

- `http://localhost:8001/generator.html`

Este flujo usa el backend local para calcular el examen, pero ademas puede:

- descargar el JSON generado
- guardarlo en una carpeta local elegida desde el navegador
- publicarlo directamente en `docs/assets/json` y regenerar `exams-index.json`

Para publicar desde la UI:

1. Pulsa el selector de carpeta de catalogo.
2. Elige la carpeta `docs/assets/json` del repo.
3. Genera el examen.
4. La UI escribira el examen dentro de `docs/assets/json/exams/...` y reconstruira el indice.

Esto requiere un navegador compatible con File System Access API.

### Quiero convertir salida de NotebookLM

Abre:

- `http://localhost:8001/notebooklm.html`

Este flujo sirve para pegar la salida estructurada de NotebookLM y convertirla en un banco JSON utilizable por la app.

No hay integracion directa con NotebookLM. El flujo real es:

1. Pides a NotebookLM una salida estructurada.
2. Pegas esa salida en `notebooklm.html`.
3. Generas el JSON final.
4. Opcionalmente lo publicas tambien en `docs/assets/json`.

La pantalla permite definir tambien el nombre final del fichero de salida.

### Quiero corregir un examen ya realizado

Usa el script:

```bash
python src/corregir_examen.py
```

O con parametros:

```bash
python src/corregir_examen.py \
  --exam-input "input/examenes_realizados/mi-examen.json" \
  --correction-file "out/examenes/mi-examen-base.json" \
  --output-dir "out/informes" \
  --output-prefix "correccion"
```

La salida se genera en `out/informes/...` en JSON y Markdown.

## Pantallas y para que sirve cada una

### `docs/index.html`

Visor y resolvedor de examenes.

Sirve para:

- abrir examenes publicados del catalogo estatico
- contestarlos en navegador
- cargar respuestas previas
- guardar un realizado en JSON

Es la unica pagina pensada para publicacion estatica tipo GitHub Pages.

### `docs/generator.html`

Generador clasico de examenes.

Sirve para:

- elegir un preset
- lanzar la generacion usando `src/server.py`
- descargar el JSON generado
- guardarlo en una carpeta local
- darlo de alta en el catalogo estatico

### `docs/notebooklm.html`

Conversor de salida estructurada a banco JSON.

Sirve para:

- pegar contenido estructurado
- convertirlo a JSON valido para la app
- descargarlo
- guardarlo en el catalogo estatico

## Catalogo estatico publico

La publicacion publica funciona con estos ficheros:

- indice maestro: `docs/assets/json/exams-index.json`
- examenes publicados: `docs/assets/json/exams/...`

### Regenerar el catalogo desde `out/examenes`

```bash
python src/static_exam_catalog.py
```

Este script:

- recorre `out/examenes/**/*.json`
- filtra solo examenes publicables
- normaliza metadatos basicos
- copia cada examen a `docs/assets/json/exams/...`
- reconstruye `docs/assets/json/exams-index.json`

### Normalizar examenes historicos antes de publicar

```bash
python src/normalize_out_exam_metadata.py
```

Este script corrige en `out/examenes/...` campos como:

- `subjectTitle`
- `totalQuestions`
- `scoring.formulaTip`

Recomendacion practica cuando has tocado muchos JSON antiguos:

```bash
python src/normalize_out_exam_metadata.py
python src/static_exam_catalog.py
```

## Servidores locales

### Servidor simple para ver `docs/`

```bash
python -m http.server 8001 --directory docs
```

Sirve para probar el visor estatico y las paginas de `docs/` sin API.

### Servidor de generacion

```bash
python src/server.py
```

Sirve `docs/` y ademas expone el endpoint de generacion usado por `generator.html`.

URL utiles:

- `http://localhost:8001/`
- `http://localhost:8001/generator.html`
- `http://localhost:8001/notebooklm.html`

## Generacion por scripts

### Presets

Los presets viven en:

- `src/exam_presets.py` para Python
- `docs/data/presets.json` para la UI

Normalmente un preset define:

- fichero de entrada
- fichero de salida
- asignatura y titulo
- numero de preguntas
- penalizacion
- tiempo

### Banco de preguntas de entrada

El JSON de entrada puede ser:

- un array de preguntas
- o un objeto con `questions`

Campos soportados por pregunta:

| Campo | Alias aceptado | Obligatorio | Descripcion |
|---|---|---|---|
| `pregunta` | `text` | Si | Enunciado |
| `opciones` | `options` | Si | Respuestas |
| `correcta` | `correctOption` | Si | Opcion correcta |
| `explicacion` | `explanation` | No | Comentario de correccion |
| `imagen` | `image` | No | Recurso visual asociado |

Ejemplo:

```json
{
  "pregunta": "¿Que estructura señala la flecha A?",
  "imagen": "assets/images/figura-3.png",
  "opciones": {
    "a": "Amigdala",
    "b": "Hipocampo",
    "c": "Talamo",
    "d": "Corteza"
  },
  "correcta": "b",
  "explicacion": "La flecha señala el hipocampo"
}
```

### Plantilla para correccion

Si activas `GENERATE_TEMPLATE = True` en `src/generar_examen.py`, ademas del examen se genera una plantilla en `input/examenes_realizados/...` con `marked_option` vacio.

Esa plantilla es la que luego rellenas para pasarla a `src/corregir_examen.py`.

## Base de datos

La BD sigue existiendo como soporte local y de importacion, pero ya no es el mecanismo principal de la parte publica.

Se mantiene para:

- guardar examenes tambien en SQLite o PostgreSQL
- importar historicos a BD
- exponer endpoints locales de consulta cuando usas `src/server.py`

Comandos utiles:

```bash
python src/import_out_exams_to_db.py
EXAM_DB_URL="postgresql://usuario@localhost:5432/examenes_local" python src/init_postgres_schema.py
```

Pero si tu objetivo es la web publica, lo importante es el catalogo estatico en `docs/assets/json`.

## Tareas de VS Code

En `Terminal > Run Task` tienes:

- `Levantar servidor HTTP`
- `Generar examen (Python)`
- `Corregir examen (Python)`
- `Servidor de Generación (Python)`

Resumen:

- `Levantar servidor HTTP`: sirve `docs/` en `http://localhost:8001/`
- `Generar examen (Python)`: ejecuta `src/generar_examen.py`
- `Corregir examen (Python)`: ejecuta `src/corregir_examen.py`
- `Servidor de Generación (Python)`: ejecuta `src/server.py`

Todas usan `C:/Program Files/Python39-33/python.exe`.

## PWA y modo movil

La carpeta `mobile/` sigue reutilizando `docs/` como `webDir`.

Tienes dos opciones:

- usar la PWA desde navegador movil
- empaquetar con Capacitor

Comandos tipicos:

```bash
cd mobile
npm install
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```
