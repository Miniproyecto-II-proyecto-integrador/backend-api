import { obtenerAuth } from "../config/firebase";
import { AppError, Errores } from "../errors/AppError";
import {
  actualizarPerfilConUsername,
  PerfilUsuario,
  correoEnUsoPorOtro,
  crearPerfilConUsername,
  leerPerfil,
  usernameDisponible,
} from "../repositories/users.repository";
import { UsuarioAutenticado } from "../types/usuario";
import {
  consultaUsernameSchema,
  actualizarPerfilSchema,
  perfilGoogleSchema,
  perfilManualSchema,
  validar,
} from "../validators/users.schemas";

export type PerfilRespuesta = PerfilUsuario & { uid: string };

export async function consultarUsername(username: unknown) {
  const { username: valido } = validar(consultaUsernameSchema, { username });
  return { username: valido, disponible: await usernameDisponible(valido) };
}

/** "Juan Diego Ledezma" -> nombres "Juan Diego", apellidos "Ledezma". */
function separarNombre(completo: string | undefined, email: string) {
  const partes = (completo ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0)
    return { nombres: email.split("@")[0], apellidos: "" };
  if (partes.length === 1) return { nombres: partes[0], apellidos: "" };
  const mitad = Math.ceil(partes.length / 2);
  return {
    nombres: partes.slice(0, mitad).join(" "),
    apellidos: partes.slice(mitad).join(" "),
  };
}

/**
 * Sirve para US-01 (manual) y US-02 (Google).
 * Con Google, nombre, avatar y correo vienen del token verificado,
 * nunca del cuerpo, para que nadie los falsifique.
 */
export async function crearPerfil(
  usuario: UsuarioAutenticado,
  cuerpo: unknown,
): Promise<PerfilRespuesta> {
  if (!usuario.email) {
    throw Errores.datosInvalidos({
      correo: "Tu cuenta no tiene un correo asociado.",
    });
  }
  const email = usuario.email.toLowerCase();

  let datos: Omit<
    PerfilUsuario,
    "email" | "proveedor" | "perfilCompleto" | "creadoEn"
  >;
  if (usuario.proveedor === "google") {
    const { username } = validar(perfilGoogleSchema, cuerpo);
    datos = {
      ...separarNombre(usuario.nombre, email),
      username,
      avatar: usuario.foto ?? "",
    };
  } else {
    datos = validar(perfilManualSchema, cuerpo);
  }

  if (await correoEnUsoPorOtro(email, usuario.uid)) {
    throw Errores.correoYaRegistrado();
  }

  const perfil: PerfilUsuario = {
    ...datos,
    email,
    proveedor: usuario.proveedor,
    perfilCompleto: true,
    creadoEn: new Date().toISOString(),
  };
  await crearPerfilConUsername(usuario.uid, perfil);
  return { uid: usuario.uid, ...perfil };
}

export async function obtenerMiPerfil(uid: string): Promise<PerfilRespuesta> {
  const perfil = await leerPerfil(uid);
  if (!perfil) throw Errores.perfilNoEncontrado();
  return { uid, ...perfil };
}

function codigoFirebase(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export async function actualizarMiPerfil(
  usuario: UsuarioAutenticado,
  cuerpo: unknown,
): Promise<PerfilRespuesta> {
  const cambios = validar(actualizarPerfilSchema, cuerpo);
  const perfilActual = await leerPerfil(usuario.uid);
  if (!perfilActual) throw Errores.perfilNoEncontrado();

  const perfilNuevo: PerfilUsuario = {
    ...perfilActual,
    ...cambios,
    email: cambios.email ?? perfilActual.email,
    username: cambios.username ?? perfilActual.username,
  };

  if (
    cambios.username &&
    cambios.username.toLowerCase() !== perfilActual.username.toLowerCase() &&
    !(await usernameDisponible(cambios.username))
  ) {
    throw Errores.usernameNoDisponible();
  }
  if (
    cambios.email &&
    cambios.email !== perfilActual.email &&
    (await correoEnUsoPorOtro(cambios.email, usuario.uid))
  ) {
    throw Errores.correoYaRegistrado();
  }

  let correoAuthAnterior: string | undefined;
  let correoAuthActualizado = false;
  if (cambios.email !== undefined) {
    let cuentaAuth;
    try {
      cuentaAuth = await obtenerAuth().getUser(usuario.uid);
    } catch (error) {
      if (codigoFirebase(error) === "auth/user-not-found") {
        throw Errores.tokenInvalido();
      }
      console.error("[Firebase Auth] leer cuenta para actualizar perfil:", error);
      throw Errores.firebaseAuthNoDisponible();
    }

    correoAuthAnterior = cuentaAuth.email ?? perfilActual.email;
    if (correoAuthAnterior?.toLowerCase() !== perfilNuevo.email) {
      try {
        await obtenerAuth().updateUser(usuario.uid, {
          email: perfilNuevo.email,
        });
        correoAuthActualizado = true;
      } catch (error) {
        if (codigoFirebase(error) === "auth/email-already-exists") {
          throw Errores.correoYaRegistrado();
        }
        if (codigoFirebase(error) === "auth/user-not-found") {
          throw Errores.tokenInvalido();
        }
        console.error("[Firebase Auth] actualizar correo:", error);
        try {
          const cuentaTrasFallo = await obtenerAuth().getUser(usuario.uid);
          const emailActual = cuentaTrasFallo.email?.toLowerCase();
          if (emailActual === perfilNuevo.email) {
            await obtenerAuth().updateUser(usuario.uid, {
              email: correoAuthAnterior,
            });
          } else if (emailActual !== correoAuthAnterior.toLowerCase()) {
            throw Errores.correoNoSincronizado();
          }
        } catch (errorVerificacion) {
          if (errorVerificacion instanceof AppError) throw errorVerificacion;
          console.error(
            "[Firebase Auth] verificar/revertir cambio de correo:",
            errorVerificacion,
          );
          throw Errores.correoNoSincronizado();
        }
        throw Errores.firebaseAuthNoDisponible();
      }
    }
  }

  try {
    await actualizarPerfilConUsername(
      usuario.uid,
      perfilNuevo,
      perfilActual.username,
      perfilActual.email,
    );
  } catch (error) {
    if (correoAuthActualizado) {
      if (
        error instanceof AppError &&
        error.codigo === "FIRESTORE_NO_DISPONIBLE"
      ) {
        try {
          const perfilPersistido = await leerPerfil(usuario.uid);
          if (perfilPersistido?.email === perfilNuevo.email) {
            return { uid: usuario.uid, ...perfilPersistido };
          }
        } catch (errorVerificacion) {
          console.error(
            "[Firestore] verificar escritura de perfil:",
            errorVerificacion,
          );
          throw Errores.correoNoSincronizado();
        }
      }
      try {
        await obtenerAuth().updateUser(usuario.uid, {
          email: correoAuthAnterior,
        });
      } catch (errorReversion) {
        console.error(
          "[Firebase Auth] no se pudo revertir el cambio de correo:",
          errorReversion,
        );
        throw Errores.correoNoSincronizado();
      }
    }
    throw error;
  }

  return { uid: usuario.uid, ...perfilNuevo };
}
