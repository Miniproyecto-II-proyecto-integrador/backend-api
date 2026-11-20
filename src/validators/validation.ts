import { z } from "zod";
import { Errores } from "../errors/AppError";

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
