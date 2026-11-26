import {
  actualizarNombreSala,
  limpiarSalaCerrada,
  listarSalasPropias,
  marcarCierreSala,
  crearSala as guardarSala,
} from "../repositories/rooms.repository";
import { Errores } from "../errors/AppError";
import { SalaRespuesta } from "../types/room";
import {
  crearSalaSchema,
  editarSalaSchema,
  paramsSalaSchema,
} from "../validators/rooms.schemas";
import { validar } from "../validators/validation";

export async function crearSala(
  ownerUid: string,
  cuerpo: unknown,
): Promise<SalaRespuesta> {
  const { nombre } = validar(crearSalaSchema, cuerpo);
  return guardarSala(ownerUid, nombre);
}

export async function listarSalas(ownerUid: string): Promise<SalaRespuesta[]> {
  return listarSalasPropias(ownerUid);
}

export async function listarSalasEnCierre(ownerUid: string): Promise<SalaRespuesta[]> {
  return listarSalasPropias(ownerUid, "en_cierre");
}

export async function editarSala(
  uid: string,
  parametros: unknown,
  cuerpo: unknown,
): Promise<SalaRespuesta> {
  const { id } = validar(paramsSalaSchema, parametros);
  const { nombre } = validar(editarSalaSchema, cuerpo);
  return actualizarNombreSala(id, uid, nombre);
}

export async function eliminarSala(uid: string, parametros: unknown): Promise<void> {
  const { id } = validar(paramsSalaSchema, parametros);
  if (!(await marcarCierreSala(id, uid))) throw Errores.datoNoEncontrado();
  await limpiarSalaCerrada(id);
}
