import { NextFunction, Request, Response } from "express";
import { obtenerAuth } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";

const erroresSesionInvalida = new Set([
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

async function verificarSesion(
  req: Request,
  next: NextFunction,
  comprobarRevocacion: boolean,
) {
  try {
    const [tipo, token] = (req.headers.authorization ?? "").split(" ");
    if (tipo !== "Bearer" || !token) throw Errores.tokenInvalido();

    const decodificado = await obtenerAuth().verifyIdToken(token, comprobarRevocacion);
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
    if (error instanceof AppError) return next(error);
    const codigo = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    // Firebase Admin 12 también usa argument-error si falla la descarga de certificados.
    const falloCertificados = codigo === "auth/argument-error" && error instanceof Error
      && /^(Error fetching public keys|Error while making request:)/.test(error.message.trim());
    if (!falloCertificados && erroresSesionInvalida.has(codigo)) {
      return next(Errores.tokenInvalido());
    }
    console.error("[Firebase Auth] no se pudo verificar la sesión:", codigo || "sin código");
    next(Errores.verificacionAuthNoDisponible());
  }
}

export function requiereAuth(req: Request, _res: Response, next: NextFunction) {
  return verificarSesion(req, next, false);
}

/** Además del JWT, comprueba revocación y estado de la cuenta en Firebase Auth. */
export function requiereAuthVigente(req: Request, _res: Response, next: NextFunction) {
  return verificarSesion(req, next, true);
}
