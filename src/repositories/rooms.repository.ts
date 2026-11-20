import { Timestamp } from "firebase-admin/firestore";
import { obtenerFirestore } from "../config/firebase";
import { Errores } from "../errors/AppError";
import { SalaDocumento, SalaRespuesta } from "../types/room";

const ROOMS = "rooms";

function serializarSala(id: string, documento: SalaDocumento): SalaRespuesta {
  return {
    id,
    nombre: documento.nombre,
    ownerUid: documento.ownerUid,
    createdAt: documento.createdAt.toDate().toISOString(),
  };
}

export async function crearSala(
  ownerUid: string,
  nombre: string,
): Promise<SalaRespuesta> {
  try {
    const ref = obtenerFirestore().collection(ROOMS).doc();
    const documento: SalaDocumento = {
      nombre,
      ownerUid,
      createdAt: Timestamp.now(),
    };
    await ref.create(documento);
    return serializarSala(ref.id, documento);
  } catch (error) {
    console.error("[Firestore] crearSala:", error);
    throw Errores.firestoreNoDisponible();
  }
}

export async function listarSalasPropias(
  ownerUid: string,
): Promise<SalaRespuesta[]> {
  try {
    const snapshot = await obtenerFirestore()
      .collection(ROOMS)
      .where("ownerUid", "==", ownerUid)
      .get();
    return snapshot.docs
      .map((doc) => serializarSala(doc.id, doc.data() as SalaDocumento))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    console.error("[Firestore] listarSalasPropias:", error);
    throw Errores.firestoreNoDisponible();
  }
}
