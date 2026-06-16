import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test as setup } from "@playwright/test";
import { backendUrl, labEmail, labFrontendUrl, requireLabPassword } from "./helpers";

const authFile = resolve("playwright/.auth/lab.json");

setup("create authenticated lab storage state", async ({ request }) => {
  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: {
      email: labEmail,
      password: requireLabPassword(),
    },
  });

  if (!response.ok()) {
    throw new Error(`Unable to create E2E lab auth state. Status: ${response.status()}`);
  }

  const data = await response.json();
  const requestState = await request.storageState();
  const token = String(data?.token || "");
  const refreshToken = String(data?.refreshToken || "");
  const user = data?.user || {};
  if (!token || !refreshToken) {
    throw new Error("Unable to create E2E lab auth state: backend did not return tokens.");
  }

  const origin = new URL(labFrontendUrl).origin;
  const session = {
    isAuthenticated: true,
    mode: "login",
    role: "lab_staff",
    profile: {
      fullName: String(user.fullName || "Seed Lab User"),
      displayName: String(user.fullName || "Seed Lab User"),
      email: String(user.email || labEmail),
      reptileCount: "",
      role: "lab_staff",
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
              { name: "breedingPlannerLabAuthToken", value: token },
              { name: "breedingPlannerLabRefreshToken", value: refreshToken },
              { name: "breedingPlannerLabAuthMode", value: "cookie-preferred" },
              { name: "breedingPlannerLabAuthSession", value: JSON.stringify(session) },
            ],
          },
        ],
      },
      null,
      2
    )
  );
});
