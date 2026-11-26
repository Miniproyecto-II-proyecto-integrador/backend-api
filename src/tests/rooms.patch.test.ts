import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it, TestContext } from "node:test";
import firebaseApp = require("firebase-admin/app");
import firebaseAuth = require("firebase-admin/auth");
import firestore = require("firebase-admin/firestore");
import { app } from "../app";
import { SalaDocumento } from "../types/room";

const salaId = "sala-de-prueba";
const anfitrionUid = "uid-anfitrion";
const fecha = "2026-11-26T15:00:00.000Z";
const salaOriginal = {
  nombre: "Nombre original",
  ownerUid: anfitrionUid,
  createdAt: firestore.Timestamp.fromDate(new Date(fecha)),
};

async function prepararApi(
  t: TestContext,
  opciones: { sinSala?: boolean; fallaConfirmacion?: boolean } = {},
) {
  let sala: SalaDocumento | undefined = opciones.sinSala
    ? undefined
    : { ...salaOriginal };
  const ref = { id: salaId };
  const appFicticia = { name: "demo-test" } as firebaseApp.App;

  t.mock.getter(firebaseApp, "getApps", () => () => [appFicticia]);
  t.mock.getter(firebaseApp, "getApp", () => () => appFicticia);
  t.mock.method(firebaseAuth, "getAuth", () => ({
    async verifyIdToken(token: string) {
      if (token === "token-anfitrion") return { uid: anfitrionUid };
      if (token === "token-invitado") return { uid: "uid-invitado" };
      throw new Error("Token de prueba inválido");
    },
  }));

  const actualizar = t.mock.fn(
    (referencia: typeof ref, cambios: Partial<SalaDocumento>) => {
      assert.equal(referencia, ref);
      return cambios;
    },
  );
  type TransaccionFicticia = {
    get(referencia: typeof ref): Promise<{ data: () => SalaDocumento | undefined }>;
    update(referencia: typeof ref, cambios: Partial<SalaDocumento>): void;
  };
  const transaccion = t.mock.fn(
    async (operacion: (tx: TransaccionFicticia) => Promise<unknown>) => {
      let cambiosPendientes: Partial<SalaDocumento> | undefined;
      const resultado = await operacion({
        async get(referencia) {
          assert.equal(referencia, ref);
          return { data: () => sala && { ...sala } };
        },
        update(referencia, cambios) {
          cambiosPendientes = actualizar(referencia, cambios);
        },
      });
      if (opciones.fallaConfirmacion) throw new Error("Fallo de Firestore simulado");
      if (sala && cambiosPendientes) sala = { ...sala, ...cambiosPendientes };
      return resultado;
    },
  );
  t.mock.method(firestore, "getFirestore", () => ({
    collection(coleccion: string) {
      assert.equal(coleccion, "rooms");
      return {
        doc(id: string) {
          assert.equal(id, salaId);
          return ref;
        },
      };
    },
    runTransaction: transaccion,
  }));

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    actualizar,
    transaccion,
    leerSala: () => sala,
    patch: async (cuerpo: object, token?: string, id = salaId) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const respuesta = await fetch(`http://127.0.0.1:${address.port}/api/rooms/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(cuerpo),
      });
      return { status: respuesta.status, cuerpo: await respuesta.json() };
    },
  };
}

describe("PATCH /api/rooms/:id", () => {
  it("permite al anfitrión editar únicamente el nombre y devuelve la sala", async (t) => {
    const api = await prepararApi(t);
    const respuesta = await api.patch({ nombre: "  Nuevo nombre  " }, "token-anfitrion");

    assert.deepEqual(respuesta, {
      status: 200,
      cuerpo: { id: salaId, nombre: "Nuevo nombre", ownerUid: anfitrionUid, createdAt: fecha },
    });
    assert.equal(api.transaccion.mock.callCount(), 1);
    assert.equal(api.actualizar.mock.callCount(), 1);
    assert.deepEqual(api.actualizar.mock.calls[0].arguments[1], { nombre: "Nuevo nombre" });
    assert.deepEqual(api.leerSala(), { ...salaOriginal, nombre: "Nuevo nombre" });
  });

  it("rechaza cuerpos inválidos antes de abrir una transacción", async (t) => {
    const api = await prepararApi(t);
    const cuerposInvalidos = [
      {},
      { nombre: "  " },
      { nombre: "a".repeat(51) },
      { nombre: 1 },
      { nombre: "Nuevo", ownerUid: "otro" },
    ];
    for (const cuerpo of cuerposInvalidos) {
      const respuesta = await api.patch(cuerpo, "token-anfitrion");
      assert.equal(respuesta.status, 400);
      assert.equal(respuesta.cuerpo.error.codigo, "DATOS_INVALIDOS");
    }
    assert.equal(api.transaccion.mock.callCount(), 0);
    assert.deepEqual(api.leerSala(), salaOriginal);
  });

  it("rechaza IDs inválidos antes de abrir una transacción", async (t) => {
    const api = await prepararApi(t);
    for (const id of ["sala%2Fotra", "%20", "a".repeat(129), "__id123__", "%ZZ"]) {
      const respuesta = await api.patch({ nombre: "Nuevo" }, "token-anfitrion", id);
      assert.equal(respuesta.status, 400);
      assert.equal(respuesta.cuerpo.error.codigo, "DATOS_INVALIDOS");
    }
    assert.equal(api.transaccion.mock.callCount(), 0);
  });

  it("devuelve 404 y no escribe si la sala no existe", async (t) => {
    const api = await prepararApi(t, { sinSala: true });
    const respuesta = await api.patch({ nombre: "Nuevo" }, "token-anfitrion");
    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.cuerpo.error.codigo, "DATO_NO_ENCONTRADO");
    assert.equal(api.actualizar.mock.callCount(), 0);
  });

  it("devuelve 401 si falta el token o es inválido", async (t) => {
    const api = await prepararApi(t);
    for (const token of [undefined, "token-invalido"]) {
      const respuesta = await api.patch({ nombre: "Nuevo" }, token);
      assert.equal(respuesta.status, 401);
      assert.equal(respuesta.cuerpo.error.codigo, "TOKEN_INVALIDO");
    }
    assert.equal(api.transaccion.mock.callCount(), 0);
  });

  it("devuelve 403 y deja el documento intacto si el usuario es invitado", async (t) => {
    const api = await prepararApi(t);
    const respuesta = await api.patch({ nombre: "Nuevo" }, "token-invitado");
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.cuerpo.error.codigo, "SALA_ACCESO_DENEGADO");
    assert.equal(api.transaccion.mock.callCount(), 1);
    assert.equal(api.actualizar.mock.callCount(), 0);
    assert.deepEqual(api.leerSala(), salaOriginal);
  });

  it("devuelve 503 si Firestore falla al confirmar la transacción", async (t) => {
    const api = await prepararApi(t, { fallaConfirmacion: true });
    const respuesta = await api.patch({ nombre: "Nuevo" }, "token-anfitrion");
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.cuerpo.error.codigo, "FIRESTORE_NO_DISPONIBLE");
    assert.equal(api.actualizar.mock.callCount(), 1);
    assert.deepEqual(api.leerSala(), salaOriginal);
  });
});
