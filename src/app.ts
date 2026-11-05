import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { openapi } from "./docs/openapi";
import {
  manejadorErrores,
  rutaNoEncontrada,
} from "./middlewares/errorHandler";
import { healthDataRouter } from "./routes/healthData.routes";

export const app = express();

app.use(
  cors({
    // Si no se configuró ningún origen, no se abre a todo el mundo.
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
  })
);
app.use(express.json());

// Liviano: sirve para "despertar" la API en Render sin tocar Firestore
app.get("/health", (_req, res) => {
  res.json({ estado: "ok" });
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.use("/api", healthDataRouter);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);
