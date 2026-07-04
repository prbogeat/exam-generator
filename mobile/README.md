# Mobile shell (Capacitor)

Este directorio prepara un contenedor iOS/Android para ejecutar la app web de [../docs](../docs) dentro del teléfono.

Incluye SQLite nativa mediante `@capacitor-community/sqlite` para persistir exámenes localmente en el dispositivo (sin backend).

## Requisitos

- Node.js 20+
- Xcode (para iOS)
- Android Studio + SDK (para Android)

## Flujo rápido

1. Instala dependencias:

```bash
cd mobile
npm install
```

2. Genera plataformas (solo la primera vez):

```bash
npm run cap:add:ios
npm run cap:add:android
```

3. Sincroniza la web app de docs hacia las plataformas:

```bash
npm run cap:sync
```

4. Abre el proyecto nativo:

```bash
npm run cap:open:ios
npm run cap:open:android
```

## Notas

- El contenido web se toma directamente desde `../docs` (campo `webDir` en `capacitor.config.json`).
- Si cambias archivos dentro de `docs/`, vuelve a ejecutar `npm run cap:sync`.
- La app guarda y lee automáticamente el último examen en SQLite nativa cuando se ejecuta dentro de Capacitor.
- En navegador normal (sin Capacitor), se mantiene el fallback clásico a JSON.
