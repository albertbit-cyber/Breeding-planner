import "./config/env";
import { initSentry, captureException } from "./config/sentry";
import { env } from "./config/env";

// TypeScript compiles this file's `import`s to CommonJS `require`s hoisted
// above this line regardless of source order, so `./app` has already loaded
// by the time initSentry() runs here — fine for this project's manual
// Sentry.captureException() calls (no auto-instrumentation that needs to
// patch modules before they're required), but do not rely on this ordering
// for anything that does.
initSentry();

// Catches crashes outside Express's request lifecycle (e.g. the email worker's
// background polling) that errorHandler.ts never sees. Logs and reports to
// Sentry (no-op if unconfigured) but does not exit — matches this process's
// existing behavior of staying up through unexpected errors elsewhere.
process.on("uncaughtException", (error) => {
  console.error("[server] uncaughtException:", error);
  captureException(error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
  captureException(reason);
});

import { app } from "./app";
import { startEmailWorker, stopEmailWorker } from "./email/worker";

/*
Setup steps for true multi-computer shared data:
1. Install dependencies: npm install
2. Create a hosted PostgreSQL database (Railway/Render/AWS/etc.)
3. Fill server/.env with DATABASE_URL, JWT_SECRET, CORS_ORIGIN
4. Generate Prisma client: npm run prisma:generate
5. Run migrations: npm run prisma:migrate
6. Seed initial users/catalog/pricing: npm run prisma:seed
7. Start locally: npm run dev
8. Deploy this server to your cloud host (Railway/Render/DigitalOcean/AWS/VPS)
9. Set frontend VITE_API_URL to your deployed /api base
10. Log in from any computer using seeded users and verify shared live data
*/

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`[server] API running on port ${env.port}`);
  startEmailWorker();
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[server] received ${signal}, shutting down gracefully`);
  await stopEmailWorker();
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
