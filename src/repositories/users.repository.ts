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

  try {
    await db.runTransaction(async (t) => {
      const [usuario, username] = await Promise.all([
        t.get(refUsuario),
        t.get(refUsername),
      ]);
      if (usuario.exists) throw Errores.perfilYaExiste();
      if (username.exists) throw Errores.usernameNoDisponible();

      t.set(refUsuario, perfil);
      t.set(refUsername, { uid });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[Firestore] crearPerfilConUsername:", error);
    throw Errores.firestoreNoDisponible();
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
