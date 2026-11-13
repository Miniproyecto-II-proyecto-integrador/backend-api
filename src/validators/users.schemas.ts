import { z } from "zod";
import { Errores } from "../errors/AppError";

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

/** Consulta de disponibilidad: ?username= */
export const consultaUsernameSchema = z.object({
  username: usernameSchema,
});

/** Convierte los errores de zod en { campo: mensaje } y lanza 400. */
export function validar<S extends z.ZodType>(
  schema: S,
  datos: unknown,
): z.infer<S> {
  const resultado = schema.safeParse(datos ?? {});
  if (resultado.success) return resultado.data;

  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const clave = String(problema.path[0] ?? "general");
    if (!campos[clave]) campos[clave] = problema.message;
  }
  throw Errores.datosInvalidos(campos);
}
