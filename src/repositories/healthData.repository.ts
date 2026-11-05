import { env } from "../config/env";
import { obtenerFirestore } from "../config/firebase";
import { Errores } from "../errors/AppError";

export interface HealthDataDoc {
  [campo: string]: unknown;
}

/** Corta la espera si Firestore no responde a tiempo. */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error("Tiempo de espera agotado")),
      ms
    );
    promesa.then(
      (v) => {
        clearTimeout(temporizador);
        resolve(v);
      },
      (e) => {
        clearTimeout(temporizador);
        reject(e);
      }
    );
  });
}

/**
 * Capa de acceso a datos: es la ÚNICA que conoce Firestore.
 * Devuelve el documento o null si no existe; si Firestore falla, lanza 503.
 */
export async function leerDocumentoBase(): Promise<HealthDataDoc | null> {
  try {
    const db = obtenerFirestore();
    const snapshot = await conTiempoLimite(
      db.collection(env.collection).doc(env.document).get(),
      env.firestoreTimeoutMs
    );
    return snapshot.exists ? (snapshot.data() as HealthDataDoc) : null;
  } catch (error) {
    console.error("[Firestore] Error al leer el documento:", error);
    throw Errores.firestoreNoDisponible();
  }
}
