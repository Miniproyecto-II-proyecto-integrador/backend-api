import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actualizarPerfilSchema } from "../validators/users.schemas";

describe("actualizarPerfilSchema", () => {
  it("accepts partial updates and normalizes the email", () => {
    const resultado = actualizarPerfilSchema.safeParse({
      username: "Ana_01",
      email: "  Ana@Example.com ",
    });

    assert.equal(resultado.success, true);
    if (resultado.success) {
      assert.deepEqual(resultado.data, {
        username: "Ana_01",
        email: "ana@example.com",
      });
    }
  });

  it("rejects an empty patch", () => {
    assert.equal(actualizarPerfilSchema.safeParse({}).success, false);
  });

  it("rejects invalid usernames and email addresses", () => {
    assert.equal(
      actualizarPerfilSchema.safeParse({
        username: "nombre con espacios",
      }).success,
      false,
    );
    assert.equal(
      actualizarPerfilSchema.safeParse({ email: "no-es-correo" }).success,
      false,
    );
  });

  it("rejects a client-supplied UID", () => {
    assert.equal(
      actualizarPerfilSchema.safeParse({
        nombres: "Ana",
        uid: "otro-usuario",
      }).success,
      false,
    );
  });
});
