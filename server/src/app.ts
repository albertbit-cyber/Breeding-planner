import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRoutes } from "./routes/authRoutes";
import { labRoutes } from "./routes/labRoutes";
import { orderRoutes } from "./routes/orderRoutes";
import { breederDataRoutes } from "./routes/breederDataRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const origins = env.corsOrigin
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.nodeEnv !== "production") {
        // Development should allow localhost and LAN-hosted frontends without
        // forcing CORS_ORIGIN updates every time the host IP changes.
        callback(null, true);
        return;
      }

      if (!origins.length || origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// This backend is the single source of truth for all app clients.
// Every authenticated device calls the same hosted API and shared Postgres DB.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", ok: true, service: "breeding-planner-shared-backend" });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", ok: true, service: "breeding-planner-shared-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/breeder", breederDataRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/lab/orders", orderRoutes);

app.use(errorHandler);

export { app };
