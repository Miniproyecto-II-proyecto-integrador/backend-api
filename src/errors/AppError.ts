/**
 * Error controlado de la API. Los mensajes están pensados para mostrarse
 * tal cual al usuario (español claro, sin jerga técnica, una o dos frases),
 * de modo que el frontend los pueda poner en un elemento role="alert".
 */
export type CodigoError =
  | "FIRESTORE_NO_DISPONIBLE"
  | "DATO_NO_ENCONTRADO"
  | "RUTA_NO_ENCONTRADA"
  | "ORIGEN_NO_PERMITIDO"
  | "ERROR_INTERNO";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: CodigoError,
    mensaje: string,
    public readonly sugerencia?: string
  ) {
    super(mensaje);
    this.name = "AppError";
  }
}

export const Errores = {
  firestoreNoDisponible: () =>
    new AppError(
      503,
      "FIRESTORE_NO_DISPONIBLE",
      "No pudimos cargar la información en este momento.",
      "Intenta de nuevo en unos segundos."
    ),
  datoNoEncontrado: () =>
    new AppError(
      404,
      "DATO_NO_ENCONTRADO",
      "No encontramos la información que buscas.",
      "Vuelve a intentarlo más tarde o avisa al equipo."
    ),
  rutaNoEncontrada: () =>
    new AppError(
      404,
      "RUTA_NO_ENCONTRADA",
      "La dirección que pediste no existe en este servicio.",
      "Revisa la dirección e inténtalo de nuevo."
    ),
  interno: () =>
    new AppError(
      500,
      "ERROR_INTERNO",
      "Algo salió mal de nuestro lado.",
      "Intenta de nuevo en unos minutos."
    ),
};
