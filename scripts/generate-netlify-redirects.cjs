#!/usr/bin/env node
// Generates build/_redirects for a web app deployed on Netlify. Writes an
// /api/* proxy rule pointing at whatever VITE_API_URL is already configured
// for this Netlify site/context (dashboard env var), so the rule can never
// drift out of sync with the app's own backend URL. Inert until the app is
// actually configured to call relative /api/... paths instead of the
// absolute VITE_API_URL — see docs/architecture/saas-implementation-plan.md
// Phase 0.5 for why this exists and how to activate it.
//
// Usage (from an app directory, after `vite build`):
//   node ../scripts/generate-netlify-redirects.cjs [buildDir]

const fs = require("fs");
const path = require("path");

const buildDir = path.resolve(process.cwd(), process.argv[2] || "build");
const redirectsPath = path.join(buildDir, "_redirects");

const rawApiUrl = String(process.env.VITE_API_URL || "").trim();

const lines = [];

if (rawApiUrl) {
  let origin = "";
  try {
    origin = new URL(rawApiUrl).origin;
  } catch {
    console.warn(
      `[generate-netlify-redirects] VITE_API_URL="${rawApiUrl}" is not a valid absolute URL; skipping /api proxy rule.`
    );
  }
  if (origin) {
    lines.push(`/api/*  ${origin}/api/:splat  200!`);
  }
} else {
  console.warn("[generate-netlify-redirects] VITE_API_URL is not set; skipping /api proxy rule.");
}

lines.push("/*  /index.html  200");

if (!fs.existsSync(buildDir)) {
  console.error(`[generate-netlify-redirects] Build directory not found: ${buildDir}`);
  process.exit(1);
}

fs.writeFileSync(redirectsPath, lines.join("\n") + "\n", "utf8");
console.log(`[generate-netlify-redirects] Wrote ${redirectsPath}:\n${lines.join("\n")}`);
