import { Errores } from "../errors/AppError";
import {
  HealthDataDoc,
  leerDocumentoBase,
} from "../repositories/healthData.repository";

export interface HealthDataRespuesta {
  data: HealthDataDoc;
  leidoEn: string;
}

/**
 * Capa de lógica: decide qué significa "no hay dato" y da forma a la respuesta.
 * No sabe de HTTP (req/res) ni de Firestore.
 */
export async function obtenerHealthData(): Promise<HealthDataRespuesta> {
  const documento = await leerDocumentoBase();
  if (!documento) {
    throw Errores.datoNoEncontrado();
  }
  return { data: documento, leidoEn: new Date().toISOString() };
}
