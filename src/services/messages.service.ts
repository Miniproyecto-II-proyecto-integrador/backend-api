import { obtenerClaveCursor } from "../config/env";
import { leerMensajes } from "../repositories/messages.repository";
import type { HistorialRespuesta } from "../types/message";
import { codificarCursor, consultaHistorialSchema, decodificarCursor } from "../validators/messages.schemas";
import { paramsSalaSchema } from "../validators/rooms.schemas";
import { validar } from "../validators/validation";

export async function obtenerHistorial(parametros: unknown, consulta: unknown): Promise<HistorialRespuesta> {
  const { id: roomId } = validar(paramsSalaSchema, parametros);
  const { limit, cursor } = validar(consultaHistorialSchema, consulta);
  const clave = obtenerClaveCursor();
  const desde = cursor === undefined ? undefined : decodificarCursor(roomId, cursor, clave);
  const recientes = await leerMensajes(roomId, limit + 1, desde);
  const pagina = recientes.slice(0, limit);
  const hasMore = recientes.length > limit;
  const nextCursor = hasMore ? codificarCursor(roomId, pagina[limit - 1], clave) : null;
  const messages = pagina.reverse().map(({ id, senderUid, senderName, content, createdAt }) => ({
    id,
    roomId,
    senderUid,
    senderName,
    content,
    createdAt: createdAt.toDate().toISOString(),
  }));
  return { messages, nextCursor, hasMore };
}
