import { NextFunction, Request, Response } from "express";
import { obtenerAuth } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";

/**
 * Verifica el ID token de Firebase (Authorization: Bearer <token>).
 * Sin token, vencido o falso -> 401 con el formato de error de siempre.
 */
export async function requiereAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const [tipo, token] = (req.headers.authorization ?? "").split(" ");
    if (tipo !== "Bearer" || !token) throw Errores.tokenInvalido();

    const decodificado = await obtenerAuth().verifyIdToken(token);
    req.usuario = {
      uid: decodificado.uid,
      email: decodificado.email,
      nombre: decodificado.name,
      foto: decodificado.picture,
      proveedor:
        decodificado.firebase?.sign_in_provider === "google.com"
          ? "google"
          : "password",
    };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : Errores.tokenInvalido());
  }
}
