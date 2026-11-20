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
