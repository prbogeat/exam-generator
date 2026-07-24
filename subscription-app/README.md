# Subscription App Preview

Esta carpeta contiene una primera versión separada de Exam Assistant con autenticación y base para monetización.

## Qué incluye

- `backend/app.py`: API FastAPI con:
  - registro de usuario
  - login
  - sesión por token
  - perfil de usuario
  - administración de usuarios (solo admin)
  - catálogo privado protegido
  - guardado de progreso por usuario
- `backend/data/subscription_app.db`: SQLite local creada automáticamente al arrancar
- `frontend/index.html`: landing + registro/login
- `frontend/app.html`: área privada de usuario

## Objetivo de esta versión

Mantener la app pública actual en `docs/` como versión gratuita y abrir una línea separada para una futura versión por suscripción.

## Ejecutar el backend

```bash
cd subscription-app/backend
"C:/Program Files/Python39-33/python.exe" -m uvicorn app:app --reload --port 8010
```

## Variables de entorno del admin

Define estas variables antes de arrancar backend en entornos reales:

- `SUBSCRIPTION_ADMIN_EMAIL`
- `SUBSCRIPTION_ADMIN_NAME`
- `SUBSCRIPTION_ADMIN_PASSWORD`
- `EXAM_ASSISTANT_SECRET`

Referencia local:

- `backend/.env.example`

## Abrir el frontend

El backend sirve también el frontend y la app pública existente.

Después abre:

- `http://127.0.0.1:8010/subscription/index.html`

## Limitaciones actuales

- La autenticación usa token simple almacenado en `localStorage`
- El perfil del usuario no permite cambiar plan directamente
- No hay cobro real ni integración con Stripe o similar todavía
- El iframe reutiliza `docs/exam.html` como visor actual
- El guardado de progreso inicial guarda metadatos del examen; no sincroniza todavía las respuestas reales del iframe

## Gestión de acceso por examen

Cada examen puede incluir `accessLevel` con valores:

- `free`
- `pro`
- `premium`

Herramienta de asignación masiva (sin crear rutas nuevas ni duplicados):

```bash
"C:/Program Files/Python39-33/python.exe" src/bulk_set_exam_access.py --level premium --subject "Fundamentos de Psicobiología" --partial "Parcial 2"
```

Modo simulación:

```bash
"C:/Program Files/Python39-33/python.exe" src/bulk_set_exam_access.py --level pro --subject "Psicología de la Emoción" --dry-run
```

## Siguiente paso razonable

Conectar esta base a:

1. Stripe o Lemon Squeezy para suscripciones
2. roles/permisos reales por plan
3. sincronización completa de respuestas y progreso del examen
4. recuperación de contraseña y verificación de email
