import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
  estado: "activa" | "en_cierre" = "activa",
): Promise<SalaRespuesta[]> {
  try {
    const snapshot = await obtenerFirestore()
      .collection(ROOMS)
      .where("ownerUid", "==", ownerUid)
      .get();
    return snapshot.docs
      .filter((doc) => (doc.get("closingAt") !== undefined) === (estado === "en_cierre"))
      .map((doc) => serializarSala(doc.id, doc.data() as SalaDocumento))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    console.error("[Firestore] listarSalasPropias:", error);
    throw Errores.firestoreNoDisponible();
  }
}

export async function actualizarNombreSala(
  id: string,
  uid: string,
  nombre: string,
): Promise<SalaRespuesta> {
  try {
    const db = obtenerFirestore();
    const ref = db.collection(ROOMS).doc(id);

    return await db.runTransaction(async (t) => {
      const snapshot = await t.get(ref);
      const sala = snapshot.data() as SalaDocumento | undefined;
      if (!sala) throw Errores.datoNoEncontrado();
      if (sala.ownerUid !== uid) throw Errores.salaAccesoDenegado();
      if (sala.closingAt !== undefined) throw Errores.salaEnCierre();

      const respuesta = serializarSala(ref.id, { ...sala, nombre });
      t.update(ref, { nombre });
      return respuesta;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] actualizarNombreSala:", error);
    throw Errores.firestoreNoDisponible();
  }
}

/** Devuelve false si otro proceso ya eliminó el documento. */
export async function marcarCierreSala(id: string, uid: string): Promise<boolean> {
  try {
    const db = obtenerFirestore();
    const ref = db.collection(ROOMS).doc(id);
    return await db.runTransaction(async (t) => {
      const snapshot = await t.get(ref);
      const sala = snapshot.data() as SalaDocumento | undefined;
      if (!sala) return false;
      if (sala.ownerUid !== uid) throw Errores.salaAccesoDenegado();
      if (sala.closingAt === undefined) {
        t.update(ref, { closingAt: FieldValue.serverTimestamp() });
      }
      return true;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] marcarCierreSala:", id, error);
    throw Errores.firestoreNoDisponible();
  }
}

/** Invocar después de confirmar el cierre para impedir nuevas escrituras. */
export async function limpiarSalaCerrada(id: string): Promise<void> {
  try {
    const db = obtenerFirestore();
    const ref = db.collection(ROOMS).doc(id);
    // Mantener el documento padre hasta que todos los descendientes estén limpios.
    for (const coleccion of await ref.listCollections()) {
      await db.recursiveDelete(coleccion);
    }
    await ref.delete();
  } catch (error) {
    console.error("[Firestore] limpiarSalaCerrada:", id, error);
    throw Errores.salaEliminacionPendiente();
  }
}
