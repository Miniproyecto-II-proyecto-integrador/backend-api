const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
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

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "API de la base técnica",
    version: "0.1.0",
    description:
      "API que lee un documento de Firestore y lo entrega al frontend. " +
      "Los errores siempre vienen en español claro dentro de `error.mensaje`, " +
      "listos para mostrarse al usuario (por ejemplo en un elemento `role=\"alert\"`).",
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
        summary: "Comprobación liviana de que la API está viva (no toca Firestore)",
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
  },
};
