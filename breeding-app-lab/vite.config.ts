import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const appVersion = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8")).version as string;

// Pre-transform plugin: the shared config file uses `(import.meta as any)?.env?.VITE_API_URL`
// (TypeScript optional-chaining cast). Vite's static import.meta.env replacement does NOT
// recognise the `?.` form, so the value is never baked in. This plugin rewrites the pattern
// to a plain string literal before esbuild sees the file.
// NOTE: apiUrl must be captured in configResolved (not at plugin-creation time) because
// Vite loads .env.{mode} files AFTER evaluating vite.config.ts. Reading process.env.VITE_API_URL
// at creation time always yields "" for mode-specific env files (e.g. android-production).
function patchImportMetaEnv(): import("vite").Plugin {
  let apiUrl = "";
  return {
    name: "patch-import-meta-env-optional-chain",
    enforce: "pre",
    configResolved(config) {
      apiUrl = (config.env as Record<string, string>).VITE_API_URL ?? "";
    },
    transform(code) {
      if (!code.includes("VITE_API_URL")) return null;
      return code.replace(
        /\(import\.meta\s+as\s+any\)\?\.env\?\.VITE_API_URL/g,
        JSON.stringify(apiUrl)
      );
    },
  };
}

export default defineConfig({
  plugins: [patchImportMetaEnv(), react()],
  test: {
    // Playwright drives everything under tests/e2e against a running backend and
    // a built frontend. Vitest must not try to execute those files as unit
    // tests: it cannot, and the resulting collection errors were being read as
    // real failures. This exclusion previously lived in a stale vite.config.mts
    // that Vite never resolved (it tries .ts before .mts), so it never applied.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "tests/e2e/**",
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;

          // React runtime — must be isolated to avoid circular deps.
          // @sentry/* is included here too: @sentry/react matches "/react/" on its
          // own, but sibling packages (@sentry/core, @sentry/browser, @sentry/utils,
          // ...) don't and would otherwise land in the generic "vendor" chunk below -
          // creating a vendor -> vendor-react -> vendor circular chunk dependency
          // that crashes at runtime ("Cannot read properties of undefined (reading
          // 'createContext')") because vendor-react's React export isn't populated
          // yet when vendor needs it.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("\\react\\") ||
            id.includes("\\react-dom\\") ||
            id.includes("\\scheduler\\") ||
            id.includes("use-sync-external-store") ||
            id.includes("@sentry")
          ) {
            return "vendor-react";
          }

          // i18n stack
          if (
            id.includes("i18next") ||
            id.includes("react-i18next")
          ) {
            return "i18n";
          }

          // Large PDF/image libs
          if (id.includes("jspdf")) return "jspdf";
          if (id.includes("html2canvas")) return "html2canvas";
          if (id.includes("html5-qrcode")) return "qrcode";
          if (id.includes("/qrcode/") || id.includes("\\qrcode\\")) return "qrcode";

          // All remaining node_modules → single vendor chunk
          // (explicit name prevents Vite auto-chunking which creates circular deps)
          return "vendor";
        },
      },
    },
  },
});
