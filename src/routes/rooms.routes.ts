import { NextFunction, Request, Response, Router } from "express";
import { requiereAuth } from "../middlewares/auth";
import { crearSala, editarSala, listarSalas } from "../services/rooms.service";

export const roomsRouter = Router();

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
  requiereAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sala = await editarSala(req.usuario!.uid, req.params, req.body);
      res.status(200).json(sala);
    } catch (error) {
      next(error);
    }
  },
);
