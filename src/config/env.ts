import "dotenv/config";

function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export const env = {
  port: numero(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
  collection: process.env.FIRESTORE_COLLECTION ?? "health-data",
  document: process.env.FIRESTORE_DOCUMENT ?? "main",
  firestoreTimeoutMs: numero(process.env.FIRESTORE_TIMEOUT_MS, 5000),
};
