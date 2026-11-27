import { createHmac, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { Errores } from "../errors/AppError";
import type { PosicionMensaje } from "../types/message";

const CURSOR_MAXIMO = 8192;
const FIRMA_SHA256_BYTES = 32;

export const consultaHistorialSchema = z.object({
  limit: z.string()
    .regex(/^(?:[1-9][0-9]?|100)$/, "El límite debe ser un entero entre 1 y 100.")
    .optional()
    .transform((valor) => valor === undefined ? 50 : Number(valor)),
  cursor: z.string()
    .max(CURSOR_MAXIMO, "El cursor es demasiado largo.")
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "El cursor no tiene un formato válido.")
    .optional(),
}).strict();

const datosCursorSchema = z.object({
  v: z.literal(1),
  roomId: z.string(),
  id: z.string()
    .regex(/^(?!\.{1,2}$)(?!__[\s\S]*__$)[^/]+$/)
    .refine((id) => Buffer.byteLength(id, "utf8") <= 1500),
  seconds: z.number().int().min(-62135596800).max(253402300799),
  nanoseconds: z.number().int().min(0).max(999999999),
}).strict();

function firmar(payload: string, clave: Buffer): Buffer {
  return createHmac("sha256", clave).update(payload, "ascii").digest();
}

export function codificarCursor(
  roomId: string,
  { id, createdAt }: PosicionMensaje,
  clave: Buffer,
): string {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    roomId,
    id,
    seconds: createdAt.seconds,
    nanoseconds: createdAt.nanoseconds,
  })).toString("base64url");
  return `${payload}.${firmar(payload, clave).toString("base64url")}`;
}

export function decodificarCursor(roomId: string, cursor: string, clave: Buffer): PosicionMensaje {
  const invalido = () => Errores.datosInvalidos({ cursor: "El cursor no es válido para esta sala." });
  const [payload, firma, ...resto] = cursor.split(".");
  if (!payload || !firma || resto.length) throw invalido();

  const recibida = Buffer.from(firma, "base64url");
  if (recibida.length !== FIRMA_SHA256_BYTES || recibida.toString("base64url") !== firma) {
    throw invalido();
  }
  if (!timingSafeEqual(recibida, firmar(payload, clave))) throw invalido();

  const bytes = Buffer.from(payload, "base64url");
  if (bytes.toString("base64url") !== payload) throw invalido();

  let datos: unknown;
  try {
    datos = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalido();
  }
  const resultado = datosCursorSchema.safeParse(datos);
  if (!resultado.success || resultado.data.roomId !== roomId) throw invalido();

  const { id, seconds, nanoseconds } = resultado.data;
  return { id, createdAt: new Timestamp(seconds, nanoseconds) };
}
