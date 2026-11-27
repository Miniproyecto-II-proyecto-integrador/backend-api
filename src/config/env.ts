import "dotenv/config";
import { Errores } from "../errors/AppError";

function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export const env = {
  port: numero(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
  cursorSecret: process.env.CURSOR_SECRET,
  collection: process.env.FIRESTORE_COLLECTION ?? "health-data",
  document: process.env.FIRESTORE_DOCUMENT ?? "main",
  firestoreTimeoutMs: numero(process.env.FIRESTORE_TIMEOUT_MS, 5000),
};

export function obtenerClaveCursor(): Buffer {
  const secreto = env.cursorSecret;
  if (!secreto || !/^[a-f0-9]{64}$/i.test(secreto)) {
    console.error("[Configuración] CURSOR_SECRET debe contener 32 bytes en hexadecimal.");
    throw Errores.historialNoDisponible();
  }
  return Buffer.from(secreto, "hex");
}
