import { NextFunction, Request, Response, Router } from "express";
import { requiereAuth } from "../middlewares/auth";
import {
  consultarUsername,
  crearPerfil,
  obtenerMiPerfil,
} from "../services/users.service";

export const usersRouter = Router();

// Público: el formulario lo consulta ANTES de crear la cuenta (el servidor revalida al crear).
usersRouter.get(
  "/users/username-disponible",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await consultarUsername(req.query.username);
      res.set("Cache-Control", "no-store");
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.post(
  "/users",
  requiereAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const perfil = await crearPerfil(req.usuario!, req.body);
      res.status(201).json(perfil);
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.get(
  "/users/me",
  requiereAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const perfil = await obtenerMiPerfil(req.usuario!.uid);
      res.set("Cache-Control", "no-store");
      res.status(200).json(perfil);
    } catch (error) {
      next(error);
    }
  },
);
