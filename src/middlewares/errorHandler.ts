import { NextFunction, Request, Response } from "express";
import { AppError, Errores } from "../errors/AppError";

/** 404 para rutas que no existen, con el mismo formato de error. */
export function rutaNoEncontrada(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  next(Errores.rutaNoEncontrada());
}

/**
 * Único lugar donde se construye la respuesta de error.
 * Formato estable para que el frontend lo muestre con accesibilidad:
 * { error: { codigo, mensaje, sugerencia, campos } }
 * Nunca se expone el detalle técnico (stack, mensajes de Firebase).
 */
export function manejadorErrores(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // JSON mal formado en el cuerpo de la petición -> 400 y no 500
  const jsonRoto =
    typeof error === "object" &&
    error !== null &&
    (error as { type?: string }).type === "entity.parse.failed";

  const appError =
    error instanceof AppError
      ? error
      : jsonRoto
        ? Errores.datosInvalidos({
            general: "El formato de los datos enviados no es válido.",
          })
        : Errores.interno();

  if (!(error instanceof AppError) && !jsonRoto) {
    console.error("[Error no controlado]", error);
  }

  res.status(appError.status).json({
    error: {
      codigo: appError.codigo,
      mensaje: appError.message,
      sugerencia: appError.sugerencia,
      campos: appError.campos,
    },
  });
}
