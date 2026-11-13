import { Errores } from "../errors/AppError";
import {
  PerfilUsuario,
  correoEnUsoPorOtro,
  crearPerfilConUsername,
  leerPerfil,
  usernameDisponible,
} from "../repositories/users.repository";
import { UsuarioAutenticado } from "../types/usuario";
import {
  consultaUsernameSchema,
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
