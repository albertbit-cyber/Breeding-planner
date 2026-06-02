import "./config/env";
import { app } from "./app";
import { env } from "./config/env";

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

app.listen(env.port, "0.0.0.0", () => {
  console.log(`[server] API running on port ${env.port}`);
});
