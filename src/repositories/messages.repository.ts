import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { obtenerFirestore } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";
import type { MensajeGuardado, PosicionMensaje } from "../types/message";

export async function leerMensajes(
  roomId: string,
  cantidad: number,
  desde?: PosicionMensaje,
): Promise<MensajeGuardado[]> {
  try {
    const db = obtenerFirestore();
    const salaRef = db.collection("rooms").doc(roomId);
    const mensajes = salaRef.collection("messages");
    const ordenados = mensajes.orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    const consulta = desde ? ordenados.startAfter(desde.createdAt, desde.id) : ordenados;

    return await db.runTransaction(async (t) => {
      const sala = await t.get(salaRef);
      if (!sala.exists || sala.get("closingAt") !== undefined) throw Errores.datoNoEncontrado();

      if (desde) {
        // Confirma que el cursor corresponde a un mensaje de esta misma subcolección.
        const ancla = await t.get(mensajes.doc(desde.id));
        const fecha = ancla.get("createdAt");
        if (!(fecha instanceof Timestamp) || !fecha.isEqual(desde.createdAt)) {
          throw Errores.datosInvalidos({ cursor: "El cursor no es válido para esta sala." });
        }
      }

      const snapshot = await t.get(consulta.limit(cantidad));
      return snapshot.docs.map((doc) => ({
        ...(doc.data() as Omit<MensajeGuardado, "id">),
        id: doc.id,
      }));
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] leerMensajes:", error);
    throw Errores.firestoreNoDisponible();
  }
}
