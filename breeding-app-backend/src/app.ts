import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRoutes } from "./routes/authRoutes";
import { labRoutes } from "./routes/labRoutes";
import { orderRoutes } from "./routes/orderRoutes";
import { breederDataRoutes } from "./routes/breederDataRoutes";
import { profileRoutes } from "./routes/profileRoutes";
import { listingRoutes } from "./routes/listingRoutes";
import { inquiryRoutes } from "./routes/inquiryRoutes";
import { savedSearchRoutes } from "./routes/savedSearchRoutes";
import { notificationRoutes } from "./routes/notificationRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { subscriptionRoutes } from "./routes/subscriptionRoutes";
import { marketplaceRoutes } from "./routes/marketplaceRoutes";
import { mobileRoutes } from "./routes/mobileRoutes";
import { authFoundationRoutes } from "./routes/authFoundationRoutes";
import { systemRoutes } from "./routes/systemRoutes";
import { familyTreeRoutes } from "./routes/familyTreeRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const origins = env.corsOrigin
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (env.nodeEnv === "production" && !origins.length) {
  throw new Error("CORS_ORIGIN must list at least one allowed origin in production.");
}

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

      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "8mb" }));

// This backend is the single source of truth for all app clients.
// Every authenticated device calls the same hosted API and shared Postgres DB.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "breeding-planner-shared-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "breeding-planner-shared-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/system", systemRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/foundation", authFoundationRoutes);
app.use("/api/breeder", breederDataRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/searches", savedSearchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/lab/orders", orderRoutes);
app.use("/api/family-tree", familyTreeRoutes);

app.use(errorHandler);

export { app };
