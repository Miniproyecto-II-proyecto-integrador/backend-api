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

| Método | Ruta               | Descripción                                                            |
| ------ | ------------------ | ---------------------------------------------------------------------- |
| GET    | `/api/health-data` | Lee el documento de Firestore y lo responde                            |
| GET    | `/health`          | Comprobación liviana (no toca Firestore); útil para "despertar" Render |
| GET    | `/docs`            | Swagger UI                                                             |

### Respuesta exitosa (200)

```json
{
  "data": { "mensaje": "Hola desde Firestore" },
  "leidoEn": "2026-11-04T23:00:00.000Z"
}
```

### Errores

Todos los errores usan el mismo formato, con texto en español listo para mostrarse al usuario
(por ejemplo, en un elemento con `role="alert"`):

```json
{
  "error": {
    "codigo": "FIRESTORE_NO_DISPONIBLE",
    "mensaje": "No pudimos cargar la información en este momento.",
    "sugerencia": "Intenta de nuevo en unos segundos."
  }
}
```

| Estado | Código                    | Cuándo                                 |
| ------ | ------------------------- | -------------------------------------- |
| 404    | `DATO_NO_ENCONTRADO`      | El documento no existe en Firestore    |
| 404    | `RUTA_NO_ENCONTRADA`      | La ruta pedida no existe               |
| 503    | `FIRESTORE_NO_DISPONIBLE` | Firestore falla o no responde a tiempo |
| 500    | `ERROR_INTERNO`           | Error inesperado                       |

Los mensajes son cortos, sin jerga técnica y dicen qué hacer; el detalle técnico solo queda en los logs del servidor.

## Endpoints de usuarios (Sprint 1)

Los endpoints privados exigen el encabezado `Authorization: Bearer <ID token de Firebase>`.
Todos los errores usan el formato `{ "error": { "codigo", "mensaje", "sugerencia", "campos" } }`.

| Método | Ruta                                       | Auth | Para qué sirve                                                                         | Respuestas              |
| ------ | ------------------------------------------ | ---- | -------------------------------------------------------------------------------------- | ----------------------- |
| GET    | `/health`                                  | No   | Comprobar que la API está viva                                                         | 200                     |
| GET    | `/api/users/username-disponible?username=` | No   | Aviso temprano de si un username está libre (el servidor lo revalida al crear)         | 200, 400, 503           |
| POST   | `/api/users`                               | Sí   | Crear el perfil del usuario autenticado (registro manual y con Google)                 | 201, 400, 401, 409, 503 |
| GET    | `/api/users/me`                            | Sí   | Leer el perfil de la sesión actual; 404 si un usuario de Google aún no eligió username | 200, 401, 404, 503      |

### Códigos de error

| HTTP | Código                    | Cuándo ocurre                                                            |
| ---- | ------------------------- | ------------------------------------------------------------------------ |
| 400  | `DATOS_INVALIDOS`         | Campos vacíos o con formato incorrecto (el detalle va en `error.campos`) |
| 401  | `TOKEN_INVALIDO`          | Falta el token, está vencido o es falso                                  |
| 404  | `PERFIL_NO_ENCONTRADO`    | El usuario existe en Auth pero aún no tiene perfil                       |
| 409  | `USERNAME_NO_DISPONIBLE`  | El username ya lo tiene otra persona                                     |
| 409  | `CORREO_YA_REGISTRADO`    | Ese correo ya tiene un perfil                                            |
| 409  | `PERFIL_YA_EXISTE`        | Este usuario ya tenía su perfil creado                                   |
| 503  | `FIRESTORE_NO_DISPONIBLE` | Firestore no respondió                                                   |

### Variables de entorno

| Variable                                      | Descripción                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `PORT`                                        | Puerto de la API (Render lo define solo)                                         |
| `CORS_ORIGINS`                                | Orígenes permitidos separados por coma (URL de Vercel y `http://localhost:5173`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON`               | JSON completo de la cuenta de servicio, en una sola línea                        |
| `FIRESTORE_COLLECTION` / `FIRESTORE_DOCUMENT` | Documento de la base técnica                                                     |
| `FIRESTORE_TIMEOUT_MS`                        | Tiempo máximo de espera a Firestore                                              |

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
