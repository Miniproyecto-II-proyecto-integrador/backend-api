import { z } from "zod";

const texto = (etiqueta: string, max: number) =>
  z
    .string({
      // v4: un solo parámetro `error`; input === undefined significa "no vino el campo"
      error: (problema) =>
        problema.input === undefined
          ? `${etiqueta} es obligatorio.`
          : `${etiqueta} debe ser texto.`,
    })
    .trim()
    .min(1, `${etiqueta} es obligatorio.`)
    .max(max, `${etiqueta} no puede superar ${max} caracteres.`);

export const usernameSchema = z
  .string({
    error: (problema) =>
      problema.input === undefined
        ? "Escribe un nombre de usuario."
        : "El nombre de usuario debe ser texto.",
  })
  .trim()
  .regex(
    /^[A-Za-z0-9_]{3,20}$/,
    "Usa de 3 a 20 caracteres: letras, números o guion bajo (_), sin espacios.",
  );

/** Registro manual: el correo sale del token, no del cuerpo. */
export const perfilManualSchema = z.object({
  nombres: texto("Los nombres", 60),
  apellidos: texto("Los apellidos", 60),
  username: usernameSchema,
  avatar: texto("El avatar", 300),
});

/** Registro con Google: nombre, avatar y correo salen del token verificado. */
export const perfilGoogleSchema = z.object({
  username: usernameSchema,
});

const emailSchema = z
  .string({
    error: (problema) =>
      problema.input === undefined
        ? "Escribe un correo electrónico."
        : "El correo electrónico debe ser texto.",
  })
  .trim()
  .email("Escribe un correo electrónico válido.")
  .max(254, "El correo electrónico no puede superar 254 caracteres.")
  .transform((email) => email.toLowerCase());

/** Actualización parcial: UID y cualquier otro campo no están permitidos. */
export const actualizarPerfilSchema = z
  .object({
    nombres: texto("Los nombres", 60).optional(),
    apellidos: texto("Los apellidos", 60).optional(),
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    avatar: texto("El avatar", 300).optional(),
  })
  .strict()
  .refine((datos) => Object.keys(datos).length > 0, {
    message: "Envía al menos un campo para actualizar.",
    path: ["general"],
  });

/** Consulta de disponibilidad: ?username= */
export const consultaUsernameSchema = z.object({
  username: usernameSchema,
});

