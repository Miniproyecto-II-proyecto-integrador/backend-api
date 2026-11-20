import {
  FieldPath,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import { obtenerFirestore } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";

export interface PerfilUsuario {
  nombres: string;
  apellidos: string;
  username: string;
  email: string;
  avatar: string;
  proveedor: "password" | "google";
  perfilCompleto: boolean;
  creadoEn: string;
}

const USERS = "users";
const USERNAMES = "usernames";
const EMAILS = "emails";
const ROOMS = "rooms";
const ACCOUNT_DELETIONS = "account-deletions";

/** La unicidad no distingue mayúsculas: "Ana" y "ana" son el mismo nombre. */
const clave = (username: string) => username.toLowerCase();

export async function usernameDisponible(username: string): Promise<boolean> {
  try {
    const doc = await obtenerFirestore()
      .collection(USERNAMES)
      .doc(clave(username))
      .get();
    return !doc.exists;
  } catch (error) {
    console.error("[Firestore] usernameDisponible:", error);
    throw Errores.firestoreNoDisponible();
  }
}

export async function correoEnUsoPorOtro(
  email: string,
  uid: string,
): Promise<boolean> {
  try {
    const snap = await obtenerFirestore()
      .collection(USERS)
      .where("email", "==", email.toLowerCase())
      .limit(2)
      .get();
    return snap.docs.some((d) => d.id !== uid);
  } catch (error) {
    console.error("[Firestore] correoEnUsoPorOtro:", error);
    throw Errores.firestoreNoDisponible();
  }
}

/**
 * Crea users/{uid} y usernames/{username} en UNA transacción.
 * Si dos personas piden el mismo username a la vez, solo una la completa;
 * la otra recibe 409.
 */
export async function crearPerfilConUsername(
  uid: string,
  perfil: PerfilUsuario,
): Promise<void> {
  const db = obtenerFirestore();
  const refUsuario = db.collection(USERS).doc(uid);
  const refUsername = db.collection(USERNAMES).doc(clave(perfil.username));
  const refEmail = db.collection(EMAILS).doc(clave(perfil.email));
  const refEliminacion = db.collection(ACCOUNT_DELETIONS).doc(uid);

  try {
    await db.runTransaction(async (t) => {
      const [
        usuario,
        username,
        email,
        perfilesConCorreo,
        eliminacion,
      ] = await Promise.all([
        t.get(refUsuario),
        t.get(refUsername),
        t.get(refEmail),
        t.get(db.collection(USERS).where("email", "==", perfil.email).limit(2)),
        t.get(refEliminacion),
      ]);
      if (eliminacion.exists) throw Errores.eliminacionEnProgreso();
      if (usuario.exists) throw Errores.perfilYaExiste();
      if (username.exists) throw Errores.usernameNoDisponible();
      if (
        (email.exists && email.data()?.uid !== uid) ||
        perfilesConCorreo.docs.some((doc) => doc.id !== uid)
      ) {
        throw Errores.correoYaRegistrado();
      }

      t.set(refUsuario, perfil);
      t.set(refUsername, { uid });
      t.set(refEmail, { uid });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] crearPerfilConUsername:", error);
    throw Errores.firestoreNoDisponible();
  }
}

/**
 * Actualiza el perfil y los índices de username/correo en una transacción.
 * Los documentos índice serializan reservas simultáneas del mismo valor.
 */
export async function actualizarPerfilConUsername(
  uid: string,
  perfil: PerfilUsuario,
  usernameAnterior: string,
  emailAnterior: string,
): Promise<void> {
  const db = obtenerFirestore();
  const refUsuario = db.collection(USERS).doc(uid);
  const refUsernameNuevo = db
    .collection(USERNAMES)
    .doc(clave(perfil.username));
  const refUsernameAnterior = db
    .collection(USERNAMES)
    .doc(clave(usernameAnterior));
  const refEmailNuevo = db.collection(EMAILS).doc(clave(perfil.email));
  const refEmailAnterior = db.collection(EMAILS).doc(clave(emailAnterior));
  const refEliminacion = db.collection(ACCOUNT_DELETIONS).doc(uid);

  try {
    await db.runTransaction(async (t) => {
      const [
        usuario,
        usernameNuevo,
        usernameViejo,
        emailNuevo,
        emailViejo,
        perfilesConCorreo,
        eliminacion,
      ] = await Promise.all([
        t.get(refUsuario),
        t.get(refUsernameNuevo),
        t.get(refUsernameAnterior),
        t.get(refEmailNuevo),
        t.get(refEmailAnterior),
        t.get(db.collection(USERS).where("email", "==", perfil.email).limit(2)),
        t.get(refEliminacion),
      ]);

      if (eliminacion.exists) throw Errores.eliminacionEnProgreso();
      if (!usuario.exists) throw Errores.perfilNoEncontrado();
      if (
        usernameNuevo.exists &&
        usernameNuevo.data()?.uid !== uid
      ) {
        throw Errores.usernameNoDisponible();
      }
      if (
        (emailNuevo.exists && emailNuevo.data()?.uid !== uid) ||
        perfilesConCorreo.docs.some((doc) => doc.id !== uid)
      ) {
        throw Errores.correoYaRegistrado();
      }

      if (clave(usernameAnterior) !== clave(perfil.username)) {
        if (usernameViejo.data()?.uid === uid) t.delete(refUsernameAnterior);
        t.set(refUsernameNuevo, { uid });
      } else if (!usernameNuevo.exists) {
        t.set(refUsernameNuevo, { uid });
      }

      if (clave(emailAnterior) !== clave(perfil.email)) {
        if (emailViejo.data()?.uid === uid) t.delete(refEmailAnterior);
        t.set(refEmailNuevo, { uid });
      } else if (!emailNuevo.exists) {
        t.set(refEmailNuevo, { uid });
      }

      t.set(refUsuario, perfil);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] actualizarPerfilConUsername:", error);
    throw Errores.firestoreNoDisponible();
  }
}

export async function iniciarEliminacionCuenta(uid: string): Promise<void> {
  try {
    const db = obtenerFirestore();
    const ref = db.collection(ACCOUNT_DELETIONS).doc(uid);
    await db.runTransaction(async (t) => {
      const actual = await t.get(ref);
      if (!actual.exists) {
        t.create(ref, {
          uid,
          estado: "en_progreso",
          iniciadaEn: Timestamp.now(),
        });
      }
    });
  } catch (error) {
    console.error("[Firestore] iniciarEliminacionCuenta:", error);
    throw Errores.firestoreNoDisponible();
  }
}

/**
 * Limpieza idempotente. El marcador permanece si una operación falla para
 * bloquear nuevas escrituras y permitir reintentar con el mismo UID.
 */
export async function eliminarDatosCuenta(uid: string): Promise<void> {
  try {
    const db = obtenerFirestore();
    const salas = await db
      .collection(ROOMS)
      .where("ownerUid", "==", uid)
      .get();
    for (const sala of salas.docs) {
      await db.recursiveDelete(sala.ref);
    }

    let cursor: QueryDocumentSnapshot | undefined;
    while (true) {
      let consultaSalas = db
        .collection(ROOMS)
        .orderBy(FieldPath.documentId())
        .limit(100);
      if (cursor) consultaSalas = consultaSalas.startAfter(cursor);

      const salasRestantes = await consultaSalas.get();
      for (const sala of salasRestantes.docs) {
        const consultaMensajes = sala.ref
          .collection("messages")
          .where("senderUid", "==", uid);
        let mensajes = await consultaMensajes.limit(400).get();
        while (!mensajes.empty) {
          const batch = db.batch();
          for (const mensaje of mensajes.docs) {
            batch.update(mensaje.ref, {
              senderUid: null,
              senderName: "Usuario eliminado",
            });
          }
          await batch.commit();
          mensajes = await consultaMensajes.limit(400).get();
        }
      }

      if (salasRestantes.size < 100) break;
      cursor = salasRestantes.docs[salasRestantes.docs.length - 1];
    }

    for (const coleccion of [USERNAMES, EMAILS]) {
      const indices = await db
        .collection(coleccion)
        .where("uid", "==", uid)
        .get();
      await Promise.all(indices.docs.map((indice) => indice.ref.delete()));
    }

    await db.recursiveDelete(db.collection(USERS).doc(uid));
  } catch (error) {
    console.error("[Firestore] eliminarDatosCuenta:", error);
    throw Errores.eliminacionPendiente();
  }
}

export async function finalizarEliminacionCuenta(uid: string): Promise<void> {
  try {
    await obtenerFirestore()
      .collection(ACCOUNT_DELETIONS)
      .doc(uid)
      .delete();
  } catch (error) {
    console.error("[Firestore] finalizarEliminacionCuenta:", error);
    throw Errores.eliminacionPendiente();
  }
}

export async function leerPerfil(uid: string): Promise<PerfilUsuario | null> {
  try {
    const doc = await obtenerFirestore().collection(USERS).doc(uid).get();
    return doc.exists ? (doc.data() as PerfilUsuario) : null;
  } catch (error) {
    console.error("[Firestore] leerPerfil:", error);
    throw Errores.firestoreNoDisponible();
  }
}
