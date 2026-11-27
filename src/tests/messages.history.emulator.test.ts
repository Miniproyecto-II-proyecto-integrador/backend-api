import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { it } from "node:test";
import firebaseApp = require("firebase-admin/app");
import firebaseAuth = require("firebase-admin/auth");
import firestore = require("firebase-admin/firestore");
import { app } from "../app";
import { env } from "../config/env";
import { limpiarSalaCerrada, marcarCierreSala } from "../repositories/rooms.repository";

function barrera() {
  let abrir!: () => void;
  const espera = new Promise<void>((resolve) => { abrir = resolve; });
  return { abrir, espera };
}

const emulador = process.env.FIRESTORE_EMULATOR_HOST;

it("Firestore Emulator conserva la instantánea de una consulta que se cruza con el cierre", {
  skip: !emulador && "Requiere Firestore Emulator en loopback",
  timeout: 25_000,
}, async (t) => {
  assert.match(emulador ?? "", /^127\.0\.0\.1:[0-9]+$/);
  const firebase = firebaseApp.initializeApp({ projectId: "demo-mini2-us11" });
  const db = firestore.getFirestore(firebase);
  const sala = db.collection("rooms").doc();
  const fecha = firestore.Timestamp.now();
  const anfitrion = "host-demo";
  env.cursorSecret = randomBytes(32).toString("hex");
  t.mock.method(firebaseAuth, "getAuth", () => ({
    async verifyIdToken(token: string, vigente: boolean) {
      assert.equal(token, "invitado-demo");
      assert.equal(vigente, true);
      return { uid: token };
    },
  }));

  const salaLeida = barrera();
  const continuarConsulta = barrera();
  let interceptada = false;
  const ejecutar = db.runTransaction.bind(db);
  t.mock.method(db, "runTransaction", <T>(
    operacion: (tx: firestore.Transaction) => Promise<T>,
    opciones?: firestore.ReadOnlyTransactionOptions | firestore.ReadWriteTransactionOptions,
  ) => ejecutar(async (tx) => {
    if (opciones?.readOnly && !interceptada) {
      const get = tx.get.bind(tx);
      tx.get = (async (ref: firestore.DocumentReference) => {
        const snapshot = await get(ref);
        if (!interceptada && ref.path === sala.path) {
          assert.ok(snapshot.exists);
          assert.equal(snapshot.get("closingAt"), undefined);
          interceptada = true;
          salaLeida.abrir();
          await continuarConsulta.espera;
        }
        return snapshot;
      }) as typeof tx.get;
    }
    return operacion(tx);
  }, opciones));

  const servidor = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      servidor.close((error) => error ? reject(error) : resolve());
    });
    await db.recursiveDelete(sala);
    await db.terminate();
    await firebaseApp.deleteApp(firebase);
  });
  await once(servidor, "listening");
  const address = servidor.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/rooms/${sala.id}/messages`;
  const solicitar = () => fetch(url, {
    headers: { Authorization: "Bearer invitado-demo" },
    signal: AbortSignal.timeout(12_000),
  });

  await sala.set({ nombre: "Sala demo", ownerUid: anfitrion, createdAt: fecha });
  await sala.collection("messages").doc("antes-del-cierre").set({
    senderUid: anfitrion, senderName: "Anfitrión", content: "Hola", createdAt: fecha,
  });

  const inicial = solicitar();
  try {
    await Promise.race([
      salaLeida.espera,
      inicial.then((respuesta) => assert.fail(`La lectura debía quedar pausada, respondió ${respuesta.status}`)),
    ]);
    assert.equal(await marcarCierreSala(sala.id, anfitrion), true);
    const duranteElCierre = await solicitar();
    assert.equal(duranteElCierre.status, 404);
    assert.equal((await duranteElCierre.json()).error.codigo, "DATO_NO_ENCONTRADO");
    await limpiarSalaCerrada(sala.id);
  } finally {
    continuarConsulta.abrir();
  }

  const pagina = await inicial;
  assert.equal(pagina.status, 200);
  assert.deepEqual(await pagina.json(), {
    messages: [{
      id: "antes-del-cierre", roomId: sala.id, senderUid: anfitrion, senderName: "Anfitrión",
      content: "Hola", createdAt: fecha.toDate().toISOString(),
    }],
    hasMore: false,
    nextCursor: null,
  });
  const posterior = await solicitar();
  assert.equal(posterior.status, 404);
  assert.equal((await posterior.json()).error.codigo, "DATO_NO_ENCONTRADO");
});
