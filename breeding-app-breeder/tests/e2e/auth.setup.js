import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import base from "@playwright/test";
import { breederEmail, breederFrontendUrl, loginBreederViaApi } from "./helpers.js";

const authFile = resolve("playwright/.auth/breeder.json");
const setup = base;

setup("create authenticated breeder storage state", async ({ request }) => {
  const { token, refreshToken, user } = await loginBreederViaApi(request);
  const requestState = await request.storageState();
  const origin = new URL(breederFrontendUrl).origin;
  const fullName = String(user.fullName || "Seed Breeder");
  const session = {
    isAuthenticated: true,
    mode: "login",
    role: "breeder",
    profile: {
      fullName,
      displayName: fullName,
      email: String(user.email || breederEmail),
      reptileCount: "",
      role: "breeder",
    },
    authenticatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(authFile), { recursive: true });
  writeFileSync(
    authFile,
    JSON.stringify(
      {
        cookies: requestState.cookies || [],
        origins: [
          {
            origin,
            localStorage: [
              { name: "breedingPlannerBreederAuthToken", value: token },
              { name: "breedingPlannerBreederRefreshToken", value: refreshToken },
              { name: "breedingPlannerBreederAuthMode", value: "cookie-preferred" },
              { name: "breedingPlannerBreederAuthSession", value: JSON.stringify(session) },
            ],
          },
        ],
      },
      null,
      2
    )
  );
});
