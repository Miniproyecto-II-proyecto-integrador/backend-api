import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it, TestContext } from "node:test";
import firebaseApp = require("firebase-admin/app");
import firebaseAuth = require("firebase-admin/auth");
import firestore = require("firebase-admin/firestore");
import { app } from "../app";

const sala = "rooms/sala-a";
const mensajes = `${sala}/messages`;
const fecha = firestore.Timestamp.fromMillis(1000);
const anfitrion = { nombre: "Mi sala", ownerUid: "host", createdAt: fecha };
const mensaje = { senderUid: "host", senderName: "Anfitrión", content: "Hola" };

async function prepararApi(t: TestContext, falloParcial = false) {
  const documentos = new Map<string, firestore.DocumentData>([
    [sala, anfitrion],
    [`${mensajes}/uno`, mensaje],
    [`${mensajes}/dos`, mensaje],
    [`${sala}/extras/uno`, {}],
    ["rooms/sala-b", { ...anfitrion, ownerUid: "otro" }],
    ["rooms/sala-b/messages/ajeno", mensaje],
    ["users/host", {}],
    ["usernames/host", { uid: "host" }],
    ["emails/host@example.test", { uid: "host" }],
  ]);
  const cambios: string[] = [];
  const controles: { antesDelLote?: () => void; reintentarTransaccion?: () => void } = {};
  const verificaciones: boolean[] = [];

  function referencia(path: string): firestore.DocumentReference {
    return {
      id: path.split("/").at(-1),
      path,
      get: async () => snapshot(path),
      collection: (id: string) => coleccion(`${path}/${id}`),
      listCollections: async () => {
        assert.ok(documentos.get(path)?.closingAt, "la sala debe estar cerrada antes de limpiar");
        const hijos = [...documentos.keys()]
          .filter((clave) => clave.startsWith(`${path}/`))
          .map((clave) => clave.slice(path.length + 1).split("/")[0]);
        return [...new Set(hijos)].map((id) => coleccion(`${path}/${id}`));
      },
      delete: async () => {
        cambios.push(`borrar:${path}`);
        documentos.delete(path);
      },
    } as unknown as firestore.DocumentReference;
  }

  function snapshot(path: string): firestore.QueryDocumentSnapshot {
    const doc = documentos.get(path);
    const ref = referencia(path);
    return {
      id: ref.id,
      ref,
      exists: !!doc,
      data: () => doc,
      get: (campo: string) => doc?.[campo],
    } as firestore.QueryDocumentSnapshot;
  }

  function coleccion(path: string): firestore.CollectionReference {
    let filtro: [string, unknown] | undefined;
    let maximo = Infinity;
    let cursor = "";
    return {
      path,
      doc: (id: string) => referencia(`${path}/${id}`),
      where(campo: string, _op: string, valor: unknown) {
        filtro = [campo, valor];
        return this;
      },
      orderBy() { return this; },
      limit(n: number) { maximo = n; return this; },
      startAfter(doc: firestore.QueryDocumentSnapshot) { cursor = doc.ref.path; return this; },
      async get() {
        const docs = [...documentos.keys()].sort()
          .filter((clave) => clave.startsWith(`${path}/`) && !clave.slice(path.length + 1).includes("/"))
          .filter((clave) => clave > cursor && (!filtro || documentos.get(clave)?.[filtro[0]] === filtro[1]))
          .slice(0, maximo)
          .map(snapshot);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    } as unknown as firestore.CollectionReference;
  }

  function actualizar(ref: firestore.DocumentReference, datos: firestore.DocumentData) {
    return () => {
      assert.ok(documentos.has(ref.path));
      cambios.push(`actualizar:${ref.path}`);
      documentos.set(ref.path, { ...documentos.get(ref.path), ...datos });
    };
  }

  const appFicticia = { name: "demo-test" } as firebaseApp.App;
  t.mock.getter(firebaseApp, "getApps", () => () => [appFicticia]);
  t.mock.getter(firebaseApp, "getApp", () => () => appFicticia);
  t.mock.method(firebaseAuth, "getAuth", () => ({
    async verifyIdToken(token: string, comprobarRevocacion: boolean) {
      verificaciones.push(comprobarRevocacion);
      if (token === "sin-auth") {
        throw Object.assign(new Error("Auth no disponible"), { code: "auth/internal-error" });
      }
      if (token === "sin-certificados") {
        throw Object.assign(new Error("Error fetching public keys for Google certs:"), {
          code: "auth/argument-error",
        });
      }
      if (comprobarRevocacion && token.startsWith("auth/")) {
        throw Object.assign(new Error("Sesión inválida"), { code: token });
      }
      const uid = token.startsWith("auth/") || token === "host-otra-sesion" ? "host" : token;
      return { uid };
    },
    async deleteUser(uid: string) { cambios.push(`auth:${uid}`); },
  }));
  t.mock.method(firestore, "getFirestore", () => ({
    collection: coleccion,
    async runTransaction(operacion: (tx: object) => Promise<unknown>) {
      while (true) {
        const escrituras: (() => void)[] = [];
        const resultado = await operacion({
          get: async (ref: firestore.DocumentReference) => snapshot(ref.path),
          update: (ref: firestore.DocumentReference, datos: firestore.DocumentData) => {
            escrituras.push(actualizar(ref, datos));
          },
          create: (ref: firestore.DocumentReference, datos: firestore.DocumentData) => {
            escrituras.push(() => {
              cambios.push(`crear:${ref.path}`);
              documentos.set(ref.path, datos);
            });
          },
        });
        if (controles.reintentarTransaccion) {
          const reintentar = controles.reintentarTransaccion;
          controles.reintentarTransaccion = undefined;
          reintentar();
          continue;
        }
        escrituras.forEach((escribir) => escribir());
        return resultado;
      }
    },
    async recursiveDelete(ref: { path: string }) {
      cambios.push(`limpiar:${ref.path}`);
      for (const clave of documentos.keys()) {
        if (clave !== ref.path && !clave.startsWith(`${ref.path}/`)) continue;
        documentos.delete(clave);
        if (falloParcial && ref.path === mensajes) {
          falloParcial = false;
          throw new Error("Fallo parcial simulado");
        }
      }
    },
    batch() {
      const escrituras: { path: string; escribir: () => void }[] = [];
      return {
        update: (ref: firestore.DocumentReference, datos: firestore.DocumentData) => {
          escrituras.push({ path: ref.path, escribir: actualizar(ref, datos) });
        },
        async commit() {
          controles.antesDelLote?.();
          if (escrituras.some(({ path }) => !documentos.has(path))) {
            throw Object.assign(new Error("El mensaje ya no existe"), { code: 5 });
          }
          escrituras.forEach(({ escribir }) => escribir());
        },
      };
    },
  }));

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    documentos,
    cambios,
    controles,
    verificaciones,
    solicitar(method: string, path: string, uid?: string, cuerpo?: object) {
      const headers: Record<string, string> = {};
      if (uid) headers.Authorization = `Bearer ${uid}`;
      if (cuerpo) headers["Content-Type"] = "application/json";
      return fetch(`http://127.0.0.1:${address.port}/api/${path}`, {
        method, headers, body: cuerpo && JSON.stringify(cuerpo),
      });
    },
  };
}

describe("DELETE /api/rooms/:id", () => {
  it("marca el cierre, borra las subcolecciones y termina con 204 sin cuerpo", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t);
    const respuesta = await solicitar("DELETE", sala, "host");
    assert.equal(respuesta.status, 204);
    assert.equal(await respuesta.text(), "");
    assert.deepEqual(cambios, [
      `actualizar:${sala}`, `limpiar:${mensajes}`, `limpiar:${sala}/extras`, `borrar:${sala}`,
    ]);
    assert.ok([...documentos.keys()].every((clave) => !clave.startsWith(sala)));
    assert.deepEqual(documentos.get("rooms/sala-b/messages/ajeno"), mensaje);
  });

  it("devuelve 403 al invitado sin pedir escrituras ni borrar datos", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t);
    const original = [...documentos];
    const respuesta = await solicitar("DELETE", sala, "guest");
    assert.equal(respuesta.status, 403);
    assert.equal((await respuesta.json()).error.codigo, "SALA_ACCESO_DENEGADO");
    assert.deepEqual(cambios, []);
    assert.deepEqual([...documentos], original);
  });

  it("rechaza peticiones sin autenticación, IDs inválidos y salas inexistentes", async (t) => {
    const { solicitar, cambios } = await prepararApi(t);
    assert.equal((await solicitar("DELETE", sala)).status, 401);
    assert.equal((await solicitar("DELETE", "rooms/a%2Fb", "host")).status, 400);
    assert.equal((await solicitar("DELETE", "rooms/ausente", "host")).status, 404);
    assert.deepEqual(cambios, []);
  });

  it("conserva el marcador tras un fallo parcial y permite reintentar", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t, true);
    const respuesta = await solicitar("DELETE", sala, "host");
    assert.equal(respuesta.status, 503);
    assert.equal((await respuesta.json()).error.codigo, "SALA_ELIMINACION_PENDIENTE");
    assert.ok(documentos.get(sala)?.closingAt);
    assert.ok(documentos.has(`${mensajes}/dos`));
    const pendientes = await solicitar("GET", "rooms/closing", "host-otra-sesion");
    assert.equal(pendientes.status, 200);
    assert.equal(pendientes.headers.get("cache-control"), "no-store");
    const [{ id }] = await pendientes.json();
    assert.equal(`rooms/${id}`, sala);
    assert.equal((await solicitar("DELETE", `rooms/${id}`, "host-otra-sesion")).status, 204);
    assert.ok([...documentos.keys()].every((clave) => !clave.startsWith(sala)));
    assert.equal(cambios.filter((cambio) => cambio === `actualizar:${sala}`).length, 1);
  });

  it("solo lista las salas propias en cierre con una sesión vigente", async (t) => {
    const { solicitar, documentos } = await prepararApi(t);
    documentos.set(sala, { ...anfitrion, closingAt: fecha });
    documentos.set("rooms/sala-b", { ...anfitrion, ownerUid: "otro", closingAt: fecha });
    documentos.set("rooms/activa", anfitrion);
    assert.equal((await solicitar("GET", "rooms/closing")).status, 401);
    const propias = await solicitar("GET", "rooms/closing", "host");
    assert.equal(propias.status, 200);
    assert.deepEqual((await propias.json()).map((doc: { id: string }) => doc.id), ["sala-a"]);
    const deOtro = await solicitar("GET", "rooms/closing", "otro");
    assert.deepEqual((await deOtro.json()).map((doc: { id: string }) => doc.id), ["sala-b"]);
    const deInvitado = await solicitar("GET", "rooms/closing", "guest");
    assert.deepEqual(await deInvitado.json(), []);
  });

  it("distingue cuentas revocadas, deshabilitadas o eliminadas de una falla de Auth", async (t) => {
    const { solicitar, cambios, verificaciones } = await prepararApi(t);
    for (const path of [sala, "users/me"]) {
      for (const token of ["auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"]) {
        const respuesta = await solicitar("DELETE", path, token);
        assert.equal(respuesta.status, 401);
        assert.equal((await respuesta.json()).error.codigo, "TOKEN_INVALIDO");
      }
      for (const token of ["sin-auth", "sin-certificados"]) {
        const respuesta = await solicitar("DELETE", path, token);
        assert.equal(respuesta.status, 503);
        assert.equal((await respuesta.json()).error.codigo, "FIREBASE_AUTH_NO_DISPONIBLE");
      }
    }
    assert.deepEqual(verificaciones, Array(10).fill(true));
    assert.deepEqual(cambios, []);
  });

  it("revalida la propiedad al reintentar la transacción de cierre", async (t) => {
    const { solicitar, documentos, cambios, controles } = await prepararApi(t);
    controles.reintentarTransaccion = () => documentos.set(sala, { ...anfitrion, ownerUid: "otro" });
    const respuesta = await solicitar("DELETE", sala, "host");
    assert.equal(respuesta.status, 403);
    assert.equal(documentos.get(sala)?.closingAt, undefined);
    assert.ok(documentos.has(`${mensajes}/uno`));
    assert.deepEqual(cambios, []);
  });

  it("revalida que la sala siga activa al reintentar la transacción de edición", async (t) => {
    const { solicitar, documentos, cambios, controles } = await prepararApi(t);
    controles.reintentarTransaccion = () => documentos.set(sala, { ...anfitrion, closingAt: fecha });
    assert.equal((await solicitar("PATCH", sala, "host", { nombre: "Nuevo" })).status, 409);
    assert.equal(documentos.get(sala)?.nombre, anfitrion.nombre);
    assert.deepEqual(cambios, []);
  });

  it("excluye salas en cierre del listado y bloquea su edición", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t);
    documentos.set(sala, { ...anfitrion, closingAt: fecha });
    documentos.set("rooms/sala-activa", anfitrion);
    const respuesta = await solicitar("PATCH", sala, "host", { nombre: "Nuevo" });
    assert.equal(respuesta.status, 409);
    assert.equal((await respuesta.json()).error.codigo, "SALA_EN_CIERRE");
    const listado = await solicitar("GET", "rooms", "host");
    assert.equal(listado.status, 200);
    assert.deepEqual((await listado.json()).map((doc: { id: string }) => doc.id), ["sala-activa"]);
    assert.deepEqual(cambios, []);
  });

  it("US-05 cierra todas las salas propias antes de limpiarlas y anonimiza en salas ajenas", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t);
    documentos.set("rooms/sala-propia", anfitrion);
    const respuesta = await solicitar("DELETE", "users/me", "host");
    assert.equal(respuesta.status, 200);
    assert.deepEqual(cambios.slice(0, 4), [
      "crear:account-deletions/host", `actualizar:${sala}`, "actualizar:rooms/sala-propia", `limpiar:${mensajes}`,
    ]);
    assert.ok(!documentos.has(sala) && !documentos.has("rooms/sala-propia"));
    assert.deepEqual(documentos.get("rooms/sala-b/messages/ajeno"), {
      ...mensaje, senderUid: null, senderName: "Usuario eliminado",
    });
    assert.deepEqual(cambios.slice(-2), ["auth:host", "borrar:account-deletions/host"]);
  });

  it("US-05 puede reanudar la limpieza de salas antes de borrar la cuenta Auth", async (t) => {
    const { solicitar, cambios, documentos } = await prepararApi(t, true);
    const respuesta = await solicitar("DELETE", "users/me", "host");
    assert.equal(respuesta.status, 503);
    assert.equal((await respuesta.json()).error.codigo, "ELIMINACION_PENDIENTE");
    assert.ok(documentos.has("account-deletions/host"));
    assert.ok(documentos.get(sala)?.closingAt);
    assert.ok(!cambios.includes("auth:host"));

    assert.equal((await solicitar("DELETE", "users/me", "host")).status, 200);
    assert.ok(!documentos.has(sala) && !documentos.has(`${mensajes}/dos`));
    assert.ok(!documentos.has("account-deletions/host"));
    assert.equal(cambios.filter((cambio) => cambio === "auth:host").length, 1);
  });

  it("US-05 vuelve a consultar y anonimiza los mensajes supervivientes de una sala ajena en cierre", async (t) => {
    const { solicitar, documentos, controles } = await prepararApi(t);
    documentos.set("rooms/sala-b", { ...anfitrion, ownerUid: "otro", closingAt: fecha });
    const borradoConcurrente = "rooms/sala-b/messages/en-borrado";
    documentos.set(borradoConcurrente, mensaje);
    controles.antesDelLote = () => documentos.delete(borradoConcurrente);
    assert.equal((await solicitar("DELETE", "users/me", "host")).status, 200);
    assert.deepEqual(documentos.get("rooms/sala-b/messages/ajeno"), {
      ...mensaje, senderUid: null, senderName: "Usuario eliminado",
    });
    assert.ok(!documentos.has(borradoConcurrente));
  });

  it("US-05 conserva su marcador ante infraestructura caída o reintentos agotados", async (t) => {
    const { solicitar, documentos, controles, cambios } = await prepararApi(t);
    documentos.set("rooms/sala-b", { ...anfitrion, ownerUid: "otro", closingAt: fecha });
    let intentos = 0;
    for (const [code, maximo] of [[14, 1], [5, 4]]) {
      intentos = 0;
      controles.antesDelLote = () => {
        intentos++;
        throw Object.assign(new Error("Fallo de lote simulado"), { code });
      };
      const respuesta = await solicitar("DELETE", "users/me", "host");
      assert.equal(respuesta.status, 503);
      assert.equal((await respuesta.json()).error.codigo, "ELIMINACION_PENDIENTE");
      assert.equal(intentos, maximo);
      assert.ok(documentos.has("account-deletions/host"));
      assert.ok(!cambios.includes("auth:host"));
    }
    controles.antesDelLote = undefined;
    assert.equal((await solicitar("DELETE", "users/me", "host")).status, 200);
    assert.ok(!documentos.has("account-deletions/host"));
  });
});
