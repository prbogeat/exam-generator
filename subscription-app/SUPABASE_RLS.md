# Supabase con Row Level Security (RLS)

## Configuración requerida

Cuando activas **RLS** en las tablas de Supabase, el backend necesita cambios para continuar operando.

### Opción 1: Usar el `service_role` (RECOMENDADO)

El `service_role` es una URL de conexión especial que **bypassea RLS**. Es seguro usarla en backends de confianza.

#### Pasos en Supabase:

1. Ve a **Settings → Database → PostgreSQL (directo)**
2. Busca la sección **"Connection string"**
3. Selecciona **"URI"** (no "Connection parameters")
4. Verás algo como:
   ```
   postgresql://postgres.[RANDOM]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Copia esta URL completa

#### Pasos en Render (o tu hosting):

1. Ve a tu aplicación en Render
2. **Environment → Add Environment Variable**
3. **Nombre:** `DATABASE_URL_SERVICE_ROLE`
4. **Valor:** La URL que copiaste
5. Redeploy

El backend automáticamente usará esta URL si está disponible.

### Opción 2: Crear políticas RLS (avanzado)

Si prefieres **mayor seguridad** y mantener RLS activo:
- Necesitarías crear políticas RLS para cada tabla
- Permitir acceso anónimo o autenticado según tu modelo
- Más complejo, pero más seguro a nivel de base de datos

### Verificación

Después de configurar, prueba:
1. En el panel de admin, crea un usuario nuevo
2. Recarga la tabla
3. El usuario debe aparecer

Si ves errores "permission denied", es porque RLS está bloqueando.

## Notas de Seguridad

- `DATABASE_URL_SERVICE_ROLE` **bypassea RLS completamente**
- Solo úsalo para aplicaciones backend de confianza
- No lo compartas ni publiques
- La seguridad a nivel de autenticación sigue siendo responsabilidad del backend (tokens, sesiones, etc.)
