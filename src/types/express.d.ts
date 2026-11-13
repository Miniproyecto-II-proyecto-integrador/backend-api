import type { UsuarioAutenticado } from "./usuario";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

export {};
