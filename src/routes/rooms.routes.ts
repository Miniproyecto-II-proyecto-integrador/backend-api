import { NextFunction, Request, Response, Router } from "express";
import { requiereAuth, requiereAuthVigente } from "../middlewares/auth";
import { obtenerHistorial } from "../services/messages.service";
import {
  crearSala, editarSala, eliminarSala, listarSalas, listarSalasEnCierre,
} from "../services/rooms.service";

export const roomsRouter = Router();

roomsRouter.get(
  "/rooms/:id/messages",
  requiereAuthVigente,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const historial = await obtenerHistorial(req.params, req.query);
      res.set("Cache-Control", "no-store");
      res.status(200).json(historial);
    } catch (error) {
      next(error);
    }
  },
);

roomsRouter.post(
  "/rooms",
  requiereAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sala = await crearSala(req.usuario!.uid, req.body);
      res.status(201).json(sala);
    } catch (error) {
      next(error);
    }
  },
);

roomsRouter.get(
  "/rooms",
  requiereAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const salas = await listarSalas(req.usuario!.uid);
      res.set("Cache-Control", "no-store");
      res.status(200).json(salas);
    } catch (error) {
      next(error);
    }
  },
);

roomsRouter.patch(
  "/rooms/:id",
  requiereAuthVigente,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sala = await editarSala(req.usuario!.uid, req.params, req.body);
      res.status(200).json(sala);
    } catch (error) {
      next(error);
    }
  },
);

roomsRouter.delete(
  "/rooms/:id",
  requiereAuthVigente,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await eliminarSala(req.usuario!.uid, req.params);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

roomsRouter.get(
  "/rooms/closing",
  requiereAuthVigente,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const salas = await listarSalasEnCierre(req.usuario!.uid);
      res.set("Cache-Control", "no-store");
      res.status(200).json(salas);
    } catch (error) {
      next(error);
    }
  },
);
