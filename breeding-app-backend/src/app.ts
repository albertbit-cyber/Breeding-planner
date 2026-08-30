import express from "express";
import compression from "compression";
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
import { reproductiveRoutes } from "./routes/reproductiveRoutes";
import { emailRoutes } from "./routes/emailRoutes";
import { inviteRoutes } from "./routes/inviteRoutes";
import { partnerRoutes } from "./routes/partnerRoutes";
import { emailWebhookRoutes } from "./routes/emailWebhookRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(helmet());
// The breeder snapshot endpoints return an account's whole dataset, which is repetitive JSON and
// compresses roughly an order of magnitude. Mounted ahead of the routes so every response benefits.
app.use(compression());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

// Mounted before express.json() below: webhook signature verification needs the
// exact raw request bytes, which a JSON body parser would already have consumed.
app.use("/api/webhooks", emailWebhookRoutes);

const origins = env.corsOrigin
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (env.nodeEnv === "production" && !origins.length) {
  console.warn("[server] CORS_ORIGIN is empty; browser origins will not receive CORS headers.");
}

// An unset LAB_PORTAL_URL is not a startup failure — env.ts falls back to the
// breeder origin so single-origin dev setups keep working. In production that
// fallback is silently wrong: invitation links still generate and still carry a
// valid token, but they land an invited laboratory on the breeder sign-in page,
// where it has no account. The only symptom is a confused vendor, so say it here.
if (env.nodeEnv === "production" && !process.env.LAB_PORTAL_URL) {
  console.warn(
    "[server] LAB_PORTAL_URL is not set; lab invitation links will point at the breeder app."
  );
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

      if (!origins.length) {
        callback(null, false);
        return;
      }

      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }

      // `callback(null, false)`, not an Error — cors declines to set CORS headers
      // and the browser blocks the response client-side, same as the empty-allowlist
      // case above. Passing an Error instead makes Express treat a disallowed origin
      // as an unhandled server error (500 via errorHandler.ts), which is what was
      // actually happening in production before this fix.
      callback(null, false);
    },
    credentials: true,
  })
);
// Embedded photos are stripped client-side before every sync request (see
// breeding-app-breeder/src/shared/apiClient.ts), so remaining payload growth is plain
// breeding/log data accumulated over the life of an account, not media. 32mb was tight
// enough for long-running accounts to hit it on text alone; give more headroom.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "64mb" }));

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
app.use("/api/reproductive", reproductiveRoutes);
app.use("/api/emails", emailRoutes);
// Unauthenticated: an invitee has a token instead of an account.
app.use("/api/invites", inviteRoutes);
// Unauthenticated: a laboratory asking to be considered has no account yet.
app.use("/api/partners", partnerRoutes);

app.use(errorHandler);

export { app };
