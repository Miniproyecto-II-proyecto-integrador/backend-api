import { z } from "zod";

const nombreSalaSchema = z
  .string({
    error: (problema) =>
      problema.input === undefined
        ? "Escribe un nombre para la sala."
        : "El nombre de la sala debe ser texto.",
  })
  .trim()
  .min(1, "Escribe un nombre para la sala.")
  .max(50, "El nombre de la sala no puede superar 50 caracteres.");

export const crearSalaSchema = z
  .object({ nombre: nombreSalaSchema })
  .strict();

export const editarSalaSchema = crearSalaSchema;

export const paramsSalaSchema = z.object({
  id: z
    .string({ error: "El ID de la sala debe ser texto." })
    .trim()
    .min(1, "Ingresa el ID de la sala.")
    .max(128, "El ID de la sala no puede superar 128 caracteres.")
    .regex(
      /^(?!\.{1,2}$)(?!__.*__$)[^/\u0000-\u001f\u007f]+$/,
      "El ID de la sala no es válido.",
    ),
});
