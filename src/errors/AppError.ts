/**
 * Error controlado de la API. Los mensajes están pensados para mostrarse
 * tal cual al usuario (español claro, sin jerga técnica, una o dos frases),
 * de modo que el frontend los pueda poner en un elemento role="alert".
 * campos` trae el mensaje de cada input con problema: { username: "..." }
 */
export type CodigoError =
  | "FIRESTORE_NO_DISPONIBLE"
  | "DATO_NO_ENCONTRADO"
  | "RUTA_NO_ENCONTRADA"
  | "ORIGEN_NO_PERMITIDO"
  | "ERROR_INTERNO"
  | "TOKEN_INVALIDO"
  | "DATOS_INVALIDOS"
  | "USERNAME_NO_DISPONIBLE"
  | "CORREO_YA_REGISTRADO"
  | "PERFIL_YA_EXISTE"
  | "PERFIL_NO_ENCONTRADO";

export type CamposError = Record<string, string>;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: CodigoError,
    mensaje: string,
    public readonly sugerencia?: string,
    public readonly campos?: CamposError,
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
      "Intenta de nuevo en unos segundos.",
    ),
  datoNoEncontrado: () =>
    new AppError(
      404,
      "DATO_NO_ENCONTRADO",
      "No encontramos la información que buscas.",
      "Vuelve a intentarlo más tarde o avisa al equipo.",
    ),
  rutaNoEncontrada: () =>
    new AppError(
      404,
      "RUTA_NO_ENCONTRADA",
      "La dirección que pediste no existe en este servicio.",
      "Revisa la dirección e inténtalo de nuevo.",
    ),
  interno: () =>
    new AppError(
      500,
      "ERROR_INTERNO",
      "Algo salió mal de nuestro lado.",
      "Intenta de nuevo en unos minutos.",
    ),

  tokenInvalido: () =>
    new AppError(
      401,
      "TOKEN_INVALIDO",
      "Tu sesión no es válida o ya venció.",
      "Inicia sesión de nuevo para continuar.",
    ),
  datosInvalidos: (campos: CamposError) =>
    new AppError(
      400,
      "DATOS_INVALIDOS",
      "Revisa los datos que escribiste.",
      "Corrige los campos señalados e inténtalo de nuevo.",
      campos,
    ),
  usernameNoDisponible: () =>
    new AppError(
      409,
      "USERNAME_NO_DISPONIBLE",
      "Ese nombre de usuario ya está en uso.",
      "Prueba con otro nombre de usuario.",
      { username: "Ese nombre de usuario ya está en uso. Prueba con otro." },
    ),
  correoYaRegistrado: () =>
    new AppError(
      409,
      "CORREO_YA_REGISTRADO",
      "Ese correo ya tiene una cuenta.",
      "Inicia sesión con ese correo.",
      { correo: "Este correo ya está registrado. Puedes iniciar sesión." },
    ),
  perfilYaExiste: () =>
    new AppError(
      409,
      "PERFIL_YA_EXISTE",
      "Tu perfil ya estaba creado.",
      "Inicia sesión para entrar a tu panel.",
    ),
  perfilNoEncontrado: () =>
    new AppError(
      404,
      "PERFIL_NO_ENCONTRADO",
      "Todavía no has completado tu perfil.",
      "Elige tu nombre de usuario para continuar.",
    ),
};
