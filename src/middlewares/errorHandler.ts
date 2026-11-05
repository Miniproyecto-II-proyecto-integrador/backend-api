import { NextFunction, Request, Response } from "express";
import { AppError, Errores } from "../errors/AppError";

/** 404 para rutas que no existen, con el mismo formato de error. */
export function rutaNoEncontrada(
  _req: Request,
  _res: Response,
  next: NextFunction
) {
  next(Errores.rutaNoEncontrada());
}

/**
 * Único lugar donde se construye la respuesta de error.
 * Formato estable para que el frontend lo muestre con accesibilidad:
 * { error: { codigo, mensaje, sugerencia } }
 * Nunca se expone el detalle técnico (stack, mensajes de Firebase).
 */
export function manejadorErrores(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const appError = error instanceof AppError ? error : Errores.interno();
  if (!(error instanceof AppError)) {
    console.error("[Error no controlado]", error);
  }
  res.status(appError.status).json({
    error: {
      codigo: appError.codigo,
      mensaje: appError.message,
      sugerencia: appError.sugerencia,
    },
  });
}
