import {
  listarSalasPropias,
  crearSala as guardarSala,
} from "../repositories/rooms.repository";
import { SalaRespuesta } from "../types/room";
import { crearSalaSchema } from "../validators/rooms.schemas";
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
