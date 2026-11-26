import type { Timestamp } from "firebase-admin/firestore";

export interface PosicionMensaje {
  id: string;
  createdAt: Timestamp;
}

export interface MensajeGuardado extends PosicionMensaje {
  senderUid: string | null;
  senderName: string;
  content: string;
}

export interface MensajeHistorial extends Omit<MensajeGuardado, "createdAt"> {
  roomId: string;
  createdAt: string;
}

export interface HistorialRespuesta {
  messages: MensajeHistorial[];
  nextCursor: string | null;
  hasMore: boolean;
}
