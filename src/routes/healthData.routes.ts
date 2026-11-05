import { NextFunction, Request, Response, Router } from "express";
import { obtenerHealthData } from "../services/healthData.service";

export const healthDataRouter = Router();

/** Capa de rutas: solo traduce HTTP <-> servicio. */
healthDataRouter.get(
  "/health-data",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await obtenerHealthData();
      res.set("Cache-Control", "no-store"); // al recargar siempre se ve el dato nuevo
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  }
);
