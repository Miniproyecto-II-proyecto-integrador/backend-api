const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        campos: {
          type: "object",
          additionalProperties: { type: "string" },
          example: {
            username: "Ese nombre de usuario ya está en uso. Prueba con otro.",
          },
        },
        codigo: { type: "string", example: "FIRESTORE_NO_DISPONIBLE" },
        mensaje: {
          type: "string",
          example: "No pudimos cargar la información en este momento.",
        },
        sugerencia: {
          type: "string",
          example: "Intenta de nuevo en unos segundos.",
        },
      },
      required: ["codigo", "mensaje"],
    },
  },
};

const perfilSchema = {
  type: "object",
  properties: {
    uid: { type: "string", example: "k3Jd9...xYz" },
    nombres: { type: "string", example: "Ana María" },
    apellidos: { type: "string", example: "Pérez Gómez" },
    username: { type: "string", example: "ana_perez" },
    email: { type: "string", example: "ana@correo.com" },
    avatar: { type: "string", example: "avatar-3" },
    proveedor: { type: "string", enum: ["password", "google"] },
    perfilCompleto: { type: "boolean", example: true },
    creadoEn: { type: "string", format: "date-time" },
  },
};

const err = (descripcion: string) => ({
  description: descripcion,
  content: { "application/json": { schema: errorSchema } },
});
const seguridad = [{ bearerAuth: [] }];

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "API de Salón de Estudio",
    version: "0.2.0",
    description:
      "API que lee un documento de Firestore y lo entrega al frontend. " +
      "Los errores siempre vienen en español claro dentro de `error.mensaje`, " +
      'listos para mostrarse al usuario (por ejemplo en un elemento `role="alert"`).',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "ID token de Firebase Authentication",
      },
    },
    schemas: {
      Sala: {
        type: "object",
        required: ["id", "nombre", "ownerUid", "createdAt"],
        properties: {
          id: { type: "string", example: "a1b2c3d4" },
          nombre: { type: "string", example: "Taller de Álgebra Lineal" },
          ownerUid: { type: "string", example: "firebase-uid" },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2026-11-20T05:00:00.000Z",
          },
        },
      },
    },
  },

  paths: {
    "/api/health-data": {
      get: {
        summary: "Lee el dato de la base técnica desde Firestore",
        tags: ["Base técnica"],
        responses: {
          "200": {
            description: "Dato leído correctamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      additionalProperties: true,
                      example: { mensaje: "Hola desde Firestore" },
                    },
                    leidoEn: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "404": {
            description: "El documento no existe en Firestore",
            content: { "application/json": { schema: errorSchema } },
          },
          "503": {
            description: "Firestore no responde",
            content: { "application/json": { schema: errorSchema } },
          },
          "500": {
            description: "Error interno inesperado",
            content: { "application/json": { schema: errorSchema } },
          },
        },
      },
    },
    "/health": {
      get: {
        summary:
          "Comprobación liviana de que la API está viva (no toca Firestore)",
        tags: ["Estado"],
        responses: {
          "200": {
            description: "La API responde",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { estado: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/users/username-disponible": {
      get: {
        summary:
          "Indica si un nombre de usuario está libre (aviso temprano; el servidor revalida al crear)",
        tags: ["Usuarios"],
        parameters: [
          {
            name: "username",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "ana_perez",
          },
        ],
        responses: {
          "200": {
            description: "Resultado",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    disponible: { type: "boolean" },
                  },
                },
              },
            },
          },
          "400": err("Formato de username inválido"),
          "503": err("Firestore no responde"),
        },
      },
    },
    "/api/users": {
      post: {
        summary:
          "Crea el perfil del usuario autenticado (registro manual y con Google)",
        description:
          "Manual: envía nombres, apellidos, username y avatar. Con Google: solo username; nombre, avatar y correo se toman del token.",
        tags: ["Usuarios"],
        security: seguridad,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  nombres: { type: "string", example: "Ana María" },
                  apellidos: { type: "string", example: "Pérez Gómez" },
                  username: { type: "string", example: "ana_perez" },
                  avatar: { type: "string", example: "avatar-3" },
                },
                required: ["username"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Perfil creado",
            content: { "application/json": { schema: perfilSchema } },
          },
          "400": err(
            "Datos inválidos (el detalle por campo viene en error.campos)",
          ),
          "401": err("Sin token o token inválido/vencido"),
          "409": err("Username o correo ya en uso, o el perfil ya existe"),
          "503": err("Firestore no responde"),
        },
      },
    },
    "/api/users/me": {
      get: {
        summary: "Devuelve el perfil de la sesión actual",
        description:
          "404 PERFIL_NO_ENCONTRADO significa que el usuario de Google aún no eligió su username.",
        tags: ["Usuarios"],
        security: seguridad,
        responses: {
          "200": {
            description: "Perfil",
            content: { "application/json": { schema: perfilSchema } },
          },
          "401": err("Sin token o token inválido/vencido"),
          "404": err("Aún no existe perfil"),
          "503": err("Firestore no responde"),
        },
      },
      patch: {
        summary: "Actualiza el perfil de la sesión actual",
        description:
          "Acepta uno o más campos de perfil. El UID se obtiene exclusivamente del ID token. Si cambia el correo, se actualizan Firebase Authentication y Firestore.",
        tags: ["Usuarios"],
        security: seguridad,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  nombres: { type: "string", example: "Ana María" },
                  apellidos: { type: "string", example: "Pérez Gómez" },
                  username: { type: "string", example: "ana_perez" },
                  email: { type: "string", format: "email", example: "ana@ejemplo.com" },
                  avatar: { type: "string", example: "avatar-2" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Perfil actualizado",
            content: { "application/json": { schema: perfilSchema } },
          },
          "400": err("Datos inválidos o no se envió ningún campo"),
          "401": err("Sin token o token inválido/vencido"),
          "404": err("Aún no existe el perfil"),
          "409": err("Username o correo ya en uso"),
          "503": err(
            "Firestore o Firebase Authentication no disponibles, o correo no sincronizado",
          ),
        },
      },
    },
    "/api/rooms": {
      post: {
        summary: "Crea una sala propia",
        description:
          "El ownerUid se obtiene del ID token verificado; no se acepta desde el cuerpo.",
        tags: ["Salas"],
        security: seguridad,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["nombre"],
                properties: {
                  nombre: {
                    type: "string",
                    minLength: 1,
                    maxLength: 50,
                    example: "Taller de Álgebra Lineal",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Sala creada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Sala" },
              },
            },
          },
          "400": err("Nombre vacío, demasiado largo o campos no permitidos"),
          "401": err("Sin token o token inválido/vencido"),
          "503": err("Firestore no responde"),
        },
      },
      get: {
        summary: "Lista las salas propias",
        description:
          "Devuelve solo las salas cuyo ownerUid coincide con el UID del ID token, ordenadas de más reciente a más antigua.",
        tags: ["Salas"],
        security: seguridad,
        responses: {
          "200": {
            description: "Lista de salas; puede estar vacía",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Sala" },
                  example: [],
                },
              },
            },
          },
          "401": err("Sin token o token inválido/vencido"),
          "503": err("Firestore no responde"),
        },
      },
    },
  },
};
