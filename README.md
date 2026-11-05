# backend-api

API REST en **Node.js + TypeScript** que lee un documento de **Firestore** y lo entrega al frontend.
Es parte de la base técnica end-to-end (TS-00). El frontend nunca consulta Firestore: todo pasa por esta API.

## Estructura por capas

```
src/
├── routes/          → capa HTTP: recibe la petición y responde
├── services/        → lógica: decide qué significa "no hay dato" y da forma a la respuesta
├── repositories/    → acceso a datos: la única capa que conoce Firestore
├── errors/          → errores controlados con mensajes claros en español
├── middlewares/     → manejo central de errores y 404
├── config/          → variables de entorno e inicialización de Firebase
└── docs/            → especificación OpenAPI (Swagger)
```

Flujo de una petición: `ruta → servicio → repositorio → Firestore`.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health-data` | Lee el documento de Firestore y lo responde |
| GET | `/health` | Comprobación liviana (no toca Firestore); útil para "despertar" Render |
| GET | `/docs` | Swagger UI |

### Respuesta exitosa (200)

```json
{ "data": { "mensaje": "Hola desde Firestore" }, "leidoEn": "2026-11-04T23:00:00.000Z" }
```

### Errores

Todos los errores usan el mismo formato, con texto en español listo para mostrarse al usuario
(por ejemplo, en un elemento con `role="alert"`):

```json
{ "error": { "codigo": "FIRESTORE_NO_DISPONIBLE", "mensaje": "No pudimos cargar la información en este momento.", "sugerencia": "Intenta de nuevo en unos segundos." } }
```

| Estado | Código | Cuándo |
|--------|--------|--------|
| 404 | `DATO_NO_ENCONTRADO` | El documento no existe en Firestore |
| 404 | `RUTA_NO_ENCONTRADA` | La ruta pedida no existe |
| 503 | `FIRESTORE_NO_DISPONIBLE` | Firestore falla o no responde a tiempo |
| 500 | `ERROR_INTERNO` | Error inesperado |

Los mensajes son cortos, sin jerga técnica y dicen qué hacer; el detalle técnico solo queda en los logs del servidor.

## Configuración

1. Copia `.env.example` a `.env` y completa los valores.
2. `FIREBASE_SERVICE_ACCOUNT_JSON` es el contenido **completo** del JSON de la cuenta de servicio, en **una sola línea**.
3. En Firestore crea la colección `health-data` con el documento `main` y algún campo, por ejemplo `mensaje: "Hola desde Firestore"`
   (los nombres se pueden cambiar con `FIRESTORE_COLLECTION` y `FIRESTORE_DOCUMENT`).
4. En `CORS_ORIGINS` pon la URL del frontend (la de Vercel en producción).

> **Nunca subas `.env` ni el JSON de la cuenta de servicio al repositorio.** El `.gitignore` ya los excluye; revisa `git status` antes de cada commit.

## Cómo ejecutarlo

### Local

```bash
npm install
npm run dev        # recarga automática
# o
npm run build && npm start
```

Prueba: <http://localhost:3000/api/health-data> y <http://localhost:3000/docs>.

### Con Docker

```bash
docker compose up --build
```

## Despliegue en Render (Docker)

1. Nuevo **Web Service** → conectar este repositorio → entorno **Docker** (Render usa el `Dockerfile`).
2. En **Environment** agrega las variables de `.env.example`, con `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON de la cuenta de servicio.
3. Health check path: `/health`.
4. Al terminar, el Swagger queda en `https://<tu-servicio>.onrender.com/docs`.

