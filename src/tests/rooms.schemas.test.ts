import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/AppError";
import { crearSalaSchema } from "../validators/rooms.schemas";
import { validar } from "../validators/validation";

describe("crearSalaSchema", () => {
  it("trims and accepts a name up to 50 characters", () => {
    const nombre = ` ${"a".repeat(50)} `;
    assert.equal(validar(crearSalaSchema, { nombre }).nombre.length, 50);
  });

  it("rejects empty names and names longer than 50 characters", () => {
    assert.equal(crearSalaSchema.safeParse({ nombre: "  " }).success, false);
    assert.equal(
      crearSalaSchema.safeParse({ nombre: "a".repeat(51) }).success,
      false,
    );
  });

  it("rejects ownerUid supplied by the client with the central 400 error", () => {
    assert.throws(
      () => validar(crearSalaSchema, { nombre: "Mi sala", ownerUid: "otro" }),
      (error: unknown) =>
        error instanceof AppError &&
        error.status === 400 &&
        error.codigo === "DATOS_INVALIDOS",
    );
  });
});
