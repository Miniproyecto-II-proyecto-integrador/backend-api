import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { env } from "./env";

/**
 * Inicializa Firebase Admin una sola vez, leyendo la cuenta de servicio
 * desde la variable de entorno (nunca desde un archivo del repositorio).
 * Se hace de forma perezosa para que la API arranque aunque falte la variable
 * y responda un error claro en lugar de caerse.
 */
export function obtenerFirestore(): Firestore {
  const app: App =
    getApps().length > 0 ? getApp() : inicializar();
  return getFirestore(app);
}

function inicializar(): App {
  if (!env.serviceAccountJson) {
    throw new Error("Falta la variable FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  const credenciales = JSON.parse(env.serviceAccountJson);
  // Render y .env a veces escapan los saltos de línea de la llave privada
  if (typeof credenciales.private_key === "string") {
    credenciales.private_key = credenciales.private_key.replace(/\\n/g, "\n");
  }
  return initializeApp({ credential: cert(credenciales) });
}
