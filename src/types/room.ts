import { Timestamp } from "firebase-admin/firestore";

export interface SalaDocumento {
  nombre: string;
  ownerUid: string;
  createdAt: Timestamp;
}

export interface SalaRespuesta {
  id: string;
  nombre: string;
  ownerUid: string;
  createdAt: string;
}
