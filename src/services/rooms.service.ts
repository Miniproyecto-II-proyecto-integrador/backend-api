import {
  actualizarNombreSala,
  listarSalasPropias,
  crearSala as guardarSala,
} from "../repositories/rooms.repository";
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

export async function editarSala(
  uid: string,
  parametros: unknown,
  cuerpo: unknown,
): Promise<SalaRespuesta> {
  const { id } = validar(paramsSalaSchema, parametros);
  const { nombre } = validar(editarSalaSchema, cuerpo);
  return actualizarNombreSala(id, uid, nombre);
}
