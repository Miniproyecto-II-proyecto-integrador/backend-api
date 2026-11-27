import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { describe, it, TestContext } from "node:test";
import firebaseApp = require("firebase-admin/app");
import firebaseAuth = require("firebase-admin/auth");
import firestore = require("firebase-admin/firestore");
import { app } from "../app";
import { env } from "../config/env";
import type { HistorialRespuesta, MensajeGuardado, PosicionMensaje } from "../types/message";

const fecha = new firestore.Timestamp(1795705200, 0);

function mensaje(id: string, segundos = 0, nanosegundos = 0): MensajeGuardado {
  return {
    id,
    senderUid: "invitado",
    senderName: "Invitado",
    content: id,
    createdAt: new firestore.Timestamp(fecha.seconds + segundos, nanosegundos),
  };
}

function comparar(a: PosicionMensaje, b: PosicionMensaje): number {
  return a.createdAt.seconds - b.createdAt.seconds
    || a.createdAt.nanoseconds - b.createdAt.nanoseconds
    || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
}

async function prepararApi(t: TestContext) {
  const clave = randomBytes(32);
  const configuracionAnterior = env.cursorSecret;
  env.cursorSecret = clave.toString("hex");
  t.after(() => { env.cursorSecret = configuracionAnterior; });

  const salas = new Map<string, { closingAt?: firestore.Timestamp }>([
    ["sala-a", {}], ["sala-b", {}], ["cerrada", { closingAt: fecha }],
  ]);
  const mensajes = new Map<string, MensajeGuardado[]>();
  const consultas: { roomId: string; cantidad: number; desde?: PosicionMensaje }[] = [];
  const leer: string[] = [];
  const appFicticia = { name: "demo-test" } as firebaseApp.App;

  t.mock.getter(firebaseApp, "getApps", () => () => [appFicticia]);
  t.mock.getter(firebaseApp, "getApp", () => () => appFicticia);
  t.mock.method(firebaseAuth, "getAuth", () => ({
    async verifyIdToken(token: string, comprobarRevocacion: boolean) {
      assert.equal(comprobarRevocacion, true);
      if (token !== "invitado") {
        throw Object.assign(new Error("Sesión de prueba inválida"), { code: "auth/id-token-revoked" });
      }
      return { uid: token };
    },
  }));

  function coleccionMensajes(roomId: string) {
    let orden = 0;
    let desde: PosicionMensaje | undefined;
    return {
      doc(id: string) {
        return {
          leer() {
            leer.push(`rooms/${roomId}/messages/${id}`);
            return { get: () => mensajes.get(roomId)?.find((doc) => doc.id === id)?.createdAt };
          },
        };
      },
      orderBy(campo: string | firestore.FieldPath, direccion: string) {
        assert.equal(direccion, "desc");
        if (orden++ === 0) assert.equal(campo, "createdAt");
        else assert.ok(campo instanceof firestore.FieldPath && campo.isEqual(firestore.FieldPath.documentId()));
        return this;
      },
      startAfter(createdAt: firestore.Timestamp, id: string) {
        assert.ok(createdAt instanceof firestore.Timestamp);
        desde = { id, createdAt };
        return this;
      },
      limit(cantidad: number) {
        assert.equal(orden, 2);
        return {
          leer() {
            consultas.push({ roomId, cantidad, desde });
            const docs = (mensajes.get(roomId) ?? [])
              .filter((doc) => !desde || comparar(doc, desde) < 0)
              .sort((a, b) => comparar(b, a))
              .slice(0, cantidad)
              .map(({ id, ...datos }) => ({ id, data: () => datos }));
            return { docs };
          },
        };
      },
    };
  }

  const ejecutar = t.mock.method(firestore, "getFirestore", () => ({
    collection(nombre: string) {
      assert.equal(nombre, "rooms");
      return {
        doc(roomId: string) {
          return {
            collection(nombreSubcoleccion: string) {
              assert.equal(nombreSubcoleccion, "messages");
              return coleccionMensajes(roomId);
            },
            leer() {
              leer.push(`rooms/${roomId}`);
              return { exists: salas.has(roomId), get: () => salas.get(roomId)?.closingAt };
            },
          };
        },
      };
    },
    async runTransaction(
      operacion: (tx: { get: (ref: { leer(): unknown }) => Promise<unknown> }) => Promise<unknown>,
      opciones: { readOnly: boolean },
    ) {
      assert.deepEqual(opciones, { readOnly: true });
      return operacion({ get: async (ref) => ref.leer() });
    },
  }));

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { port } = address;

  async function solicitar(roomId: string, query = "", token: string | null = "invitado") {
    return fetch(`http://127.0.0.1:${port}/api/rooms/${roomId}/messages${query}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
  }

  async function pagina(roomId: string, query?: string): Promise<HistorialRespuesta> {
    const respuesta = await solicitar(roomId, query);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("cache-control"), "no-store");
    return respuesta.json();
  }

  return { clave, salas, mensajes, consultas, leer, ejecutar, solicitar, pagina };
}

const ids = (pagina: HistorialRespuesta) => pagina.messages.map((doc) => doc.id);

function firmaDePrueba(payload: string, clave: Buffer): string {
  return createHmac("sha256", clave).update(payload).digest("base64url");
}

describe("GET /api/rooms/:id/messages", () => {
  it("devuelve un historial vacío y consulta una sola página de hasta 51 documentos", async (t) => {
    const { pagina, consultas, leer } = await prepararApi(t);
    assert.deepEqual(await pagina("sala-a"), { messages: [], nextCursor: null, hasMore: false });
    assert.deepEqual(consultas, [{ roomId: "sala-a", cantidad: 51, desde: undefined }]);
    assert.deepEqual(leer, ["rooms/sala-a"]);
  });

  it("aplica el límite predeterminado y el máximo sin devolver el documento adicional", async (t) => {
    const { pagina, mensajes, consultas } = await prepararApi(t);
    mensajes.set("sala-a", Array.from({ length: 101 }, (_, i) => mensaje(`msg-${i}`, i)));
    const primera = await pagina("sala-a");
    assert.equal(primera.messages.length, 50);
    assert.equal(primera.messages[0].id, "msg-51");
    assert.equal(primera.messages.at(-1)?.id, "msg-100");
    assert.equal(primera.hasMore, true);
    const maxima = await pagina("sala-a", "?limit=100");
    assert.equal(maxima.messages.length, 100);
    assert.deepEqual(consultas.map(({ cantidad }) => cantidad), [51, 101]);
  });

  it("pagina cronológicamente con desempate por ID y conserva nanosegundos en startAfter", async (t) => {
    const { pagina, mensajes, consultas, clave } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("c", 0, 2000), mensaje("a", 0, 2000), mensaje("d", 0, 3000),
      mensaje("inicio", -1), mensaje("b", 0, 1000)]);

    const reciente = await pagina("sala-a", "?limit=2");
    assert.deepEqual(ids(reciente), ["c", "d"]);
    assert.equal(reciente.hasMore, true);
    assert.ok(reciente.nextCursor);
    const [payload, firma] = reciente.nextCursor.split(".");
    assert.equal(firma, firmaDePrueba(payload, clave));
    const anterior = await pagina("sala-a", `?limit=2&cursor=${reciente.nextCursor}`);
    assert.deepEqual(ids(anterior), ["b", "a"]);
    assert.ok(anterior.nextCursor);
    const ultima = await pagina("sala-a", `?limit=2&cursor=${anterior.nextCursor}`);
    assert.deepEqual(ids(ultima), ["inicio"]);
    assert.equal(ultima.nextCursor, null);
    assert.equal(ultima.hasMore, false);
    assert.equal(consultas[1].desde?.id, "c");
    assert.equal(consultas[1].desde?.createdAt.nanoseconds, 2000);
  });

  it("marca como final una página con exactamente limit mensajes", async (t) => {
    const { pagina, mensajes } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("a"), mensaje("b")]);
    const resultado = await pagina("sala-a", "?limit=2");
    assert.deepEqual(ids(resultado), ["a", "b"]);
    assert.equal(resultado.nextCursor, null);
    assert.equal(resultado.hasMore, false);
  });

  it("permite a un invitado leer solo la sala solicitada y conserva mensajes anonimizados", async (t) => {
    const { pagina, mensajes } = await prepararApi(t);
    mensajes.set("sala-a", [{ ...mensaje("anonimo"), senderUid: null, senderName: "Usuario eliminado" }]);
    mensajes.set("sala-b", [mensaje("ajeno")]);
    assert.deepEqual((await pagina("sala-a")).messages, [{
      id: "anonimo", roomId: "sala-a", senderUid: null, senderName: "Usuario eliminado",
      content: "anonimo", createdAt: fecha.toDate().toISOString(),
    }]);
    assert.deepEqual(ids(await pagina("sala-b")), ["ajeno"]);
  });

  it("rechaza cursores malformados y payloads firmados con estructura inválida", async (t) => {
    const { pagina, solicitar, mensajes, ejecutar, clave } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("a"), mensaje("b", 0, 1000)]);
    const { nextCursor } = await pagina("sala-a", "?limit=1");
    assert.ok(nextCursor);
    const [payload, firma] = nextCursor.split(".");
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const malFormados = ["", "%2F", payload, `${payload}..${firma}`, `${payload}.${firma}.a`, `${payload}.e30`];
    for (const contenido of ["{", JSON.stringify({ ...datos, v: 99 }),
      JSON.stringify({ ...datos, nanoseconds: 1e9 }), JSON.stringify({ ...datos, id: "otra/ruta" })]) {
      const invalido = Buffer.from(contenido).toString("base64url");
      malFormados.push(`${invalido}.${firmaDePrueba(invalido, clave)}`);
    }
    for (const cursor of malFormados) {
      const respuesta = await solicitar("sala-a", `?cursor=${cursor}`);
      assert.equal(respuesta.status, 400);
      assert.ok((await respuesta.json()).error.campos.cursor);
    }
    assert.equal(ejecutar.mock.callCount(), 1);
  });

  it("rechaza manipulación, clave distinta y uso entre salas incluso con la misma ancla", async (t) => {
    const { pagina, solicitar, mensajes, consultas, leer, ejecutar, clave } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("a"), mensaje("b", 0, 1000)]);
    mensajes.set("sala-b", [mensaje("z"), mensaje("b", 0, 1000)]);
    const { nextCursor } = await pagina("sala-a", "?limit=1");
    assert.ok(nextCursor);
    const [payload, firma] = nextCursor.split(".");
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const cambiar = (campos: object) => Buffer.from(JSON.stringify({ ...datos, ...campos })).toString("base64url");
    const firmaAlterada = Buffer.from(firma, "base64url");
    firmaAlterada[0] ^= 1;
    const otraClave = Buffer.from(clave);
    otraClave[0] ^= 1;

    for (const [roomId, cursor] of [
      ["sala-a", `${cambiar({ id: "a", nanoseconds: 0 })}.${firma}`],
      ["sala-a", `${payload}.${firmaAlterada.toString("base64url")}`],
      ["sala-a", `${payload}.${firmaDePrueba(payload, otraClave)}`],
      ["sala-b", nextCursor],
      ["sala-b", `${cambiar({ roomId: "sala-b" })}.${firma}`],
    ]) {
      const respuesta = await solicitar(roomId, `?cursor=${cursor}`);
      assert.equal(respuesta.status, 400);
      assert.ok((await respuesta.json()).error.campos.cursor);
    }
    assert.deepEqual(leer, ["rooms/sala-a"]);
    assert.equal(consultas.length, 1);
    assert.equal(ejecutar.mock.callCount(), 1);
  });

  it("mantiene la validación del Timestamp de referencia tras verificar la firma", async (t) => {
    const { pagina, solicitar, mensajes, consultas, leer } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("a"), mensaje("b", 0, 1000)]);
    const { nextCursor } = await pagina("sala-a", "?limit=1");
    assert.ok(nextCursor);
    mensajes.set("sala-a", [mensaje("a"), mensaje("b", 0, 2000)]);
    const respuesta = await solicitar("sala-a", `?cursor=${nextCursor}`);
    assert.equal(respuesta.status, 400);
    assert.ok((await respuesta.json()).error.campos.cursor);
    assert.deepEqual(leer.slice(-2), ["rooms/sala-a", "rooms/sala-a/messages/b"]);
    assert.equal(consultas.length, 1);
  });

  it("devuelve 503 sin consultar Firestore si la clave falta o tiene un formato inválido", async (t) => {
    const { solicitar, ejecutar } = await prepararApi(t);
    for (const valor of [undefined, "", "menor-a-32-bytes", "z".repeat(64), "a".repeat(63)]) {
      env.cursorSecret = valor;
      const respuesta = await solicitar("sala-a");
      assert.equal(respuesta.status, 503);
      assert.equal((await respuesta.json()).error.codigo, "HISTORIAL_NO_DISPONIBLE");
    }
    assert.equal(ejecutar.mock.callCount(), 0);
  });

  it("rechaza límites inválidos, parámetros repetidos y un ID inválido antes de leer Firestore", async (t) => {
    const { solicitar, ejecutar } = await prepararApi(t);
    for (const query of ["?limit=0", "?limit=101", "?limit=-1", "?limit=1.5", "?limit=1e1", "?limit=",
      "?limit=1&limit=2", "?cursor=x&cursor=y", "?offset=2"]) {
      const respuesta = await solicitar("sala-a", query);
      assert.equal(respuesta.status, 400);
      assert.equal((await respuesta.json()).error.codigo, "DATOS_INVALIDOS");
    }
    assert.equal((await solicitar("a%2Fb")).status, 400);
    assert.equal(ejecutar.mock.callCount(), 0);
  });

  it("devuelve 401 si falta el token o se revocó", async (t) => {
    const { solicitar, ejecutar } = await prepararApi(t);
    for (const token of [null, "revocado"]) {
      const respuesta = await solicitar("sala-a", "", token);
      assert.equal(respuesta.status, 401);
      assert.equal((await respuesta.json()).error.codigo, "TOKEN_INVALIDO");
    }
    assert.equal(ejecutar.mock.callCount(), 0);
  });

  it("devuelve 404 para salas inexistentes y en cierre sin consultar mensajes", async (t) => {
    const { solicitar, consultas, mensajes } = await prepararApi(t);
    mensajes.set("cerrada", [mensaje("a")]);
    mensajes.set("ausente", [mensaje("huerfano")]);
    for (const roomId of ["ausente", "cerrada"]) {
      const respuesta = await solicitar(roomId);
      assert.equal(respuesta.status, 404);
      assert.equal((await respuesta.json()).error.codigo, "DATO_NO_ENCONTRADO");
    }
    assert.deepEqual(consultas, []);
  });

  it("mantiene el límite de la página si se insertan mensajes más recientes entre consultas", async (t) => {
    const { pagina, mensajes } = await prepararApi(t);
    mensajes.set("sala-a", [mensaje("a", 1), mensaje("b", 2), mensaje("c", 3), mensaje("d", 4)]);
    const reciente = await pagina("sala-a", "?limit=2");
    assert.deepEqual(ids(reciente), ["c", "d"]);
    mensajes.get("sala-a")!.push(mensaje("nuevo", 5));
    const anterior = await pagina("sala-a", `?limit=2&cursor=${reciente.nextCursor}`);
    assert.deepEqual(ids(anterior), ["a", "b"]);
    assert.equal(anterior.hasMore, false);
    assert.deepEqual(ids(await pagina("sala-a", "?limit=2")), ["d", "nuevo"]);
  });

  it("devuelve el error de infraestructura existente si Firestore no responde", async (t) => {
    const { solicitar, ejecutar } = await prepararApi(t);
    ejecutar.mock.mockImplementationOnce(() => { throw new Error("Fallo simulado de Firestore"); });
    const respuesta = await solicitar("sala-a");
    assert.equal(respuesta.status, 503);
    assert.equal((await respuesta.json()).error.codigo, "FIRESTORE_NO_DISPONIBLE");
  });
});
