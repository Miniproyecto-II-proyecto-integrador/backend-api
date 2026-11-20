import { Timestamp } from "firebase-admin/firestore";
import { obtenerFirestore } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";
import { SalaDocumento, SalaRespuesta } from "../types/room";

const ROOMS = "rooms";
const USERS = "users";
const ACCOUNT_DELETIONS = "account-deletions";

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
    const db = obtenerFirestore();
    const ref = db.collection(ROOMS).doc();
    const refUsuario = db.collection(USERS).doc(ownerUid);
    const refEliminacion = db.collection(ACCOUNT_DELETIONS).doc(ownerUid);
    const documento: SalaDocumento = {
      nombre,
      ownerUid,
      createdAt: Timestamp.now(),
    };
    await db.runTransaction(async (t) => {
      const [usuario, eliminacion] = await Promise.all([
        t.get(refUsuario),
        t.get(refEliminacion),
      ]);
      if (eliminacion.exists) throw Errores.eliminacionEnProgreso();
      if (!usuario.exists) throw Errores.perfilNoEncontrado();
      t.create(ref, documento);
    });
    return serializarSala(ref.id, documento);
  } catch (error) {
    if (error instanceof AppError) throw error;
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
