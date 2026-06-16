import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

/**
 * Detects the first non-internal IPv4 address so the startup log can show
 * the Network URL that other devices on the same LAN can reach.
 */
function getLanIp(): string {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "";
}

/**
 * Vite plugin that logs Local and Network URLs once the dev server is ready.
 * Complements Vite's built-in output with an explicit network address so it's
 * easy to copy-paste the URL on another device connected to the same LAN.
 */
function networkUrlLogger(): Plugin {
  return {
    name: "network-url-logger",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const port = (server.config.server.port as number) ?? 5173;
        const lanIp = getLanIp();
        process.stdout.write(
          `\n  [1mDev server ready[0m\n` +
          `  Local:   [36mhttp://localhost:${port}/[0m\n` +
          // Network URL — accessible from other devices on the same LAN via their browser
          (lanIp ? `  Network: [36mhttp://${lanIp}:${port}/[0m\n` : `  Network: (no external interface found)\n`) +
          "\n"
        );
      });
    },
  };
}

// Pre-transform plugin: the shared config file uses `(import.meta as any)?.env?.VITE_API_URL`
// (TypeScript optional-chaining cast). Vite's static import.meta.env replacement does NOT
// recognise the `?.` form, so the value is never baked in. This plugin rewrites the pattern
// to a plain string literal before esbuild sees the file.
function patchImportMetaEnv(): Plugin {
  const apiUrl = process.env.VITE_API_URL ?? "";
  return {
    name: "patch-import-meta-env-optional-chain",
    enforce: "pre",
    transform(code) {
      if (!code.includes("VITE_API_URL")) return null;
      return code.replace(
        /\(import\.meta\s+as\s+any\)\?\.env\?\.VITE_API_URL/g,
        JSON.stringify(apiUrl)
      );
    },
  };
}

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const resolveBase = (publicUrl: string | undefined): string => {
  const ensureTrailingSlash = (value: string): string =>
    value.endsWith("/") ? value : `${value}/`;

  if (!publicUrl || publicUrl === "/") {
    return "./";
  }

  try {
    const { pathname } = new URL(publicUrl, "http://localhost");
    if (!pathname || pathname === "/") {
      return "./";
    }
    return ensureTrailingSlash(pathname);
  } catch {
    return ensureTrailingSlash(publicUrl);
  }
};

const base = resolveBase(process.env.PUBLIC_URL);
// Set to true only if Electron packaging requires a single bundle.
// For web builds, code splitting dramatically reduces initial load time.
const disableCodeSplitting = process.env.ELECTRON_BUILD === "true";

export default defineConfig({
  base,
  plugins: [tailwindcss(), patchImportMetaEnv(), react(), networkUrlLogger()],
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.{idea,git,cache,output,temp}/**",
      "server/**",
      "tests/e2e/**",
      "src/genetics/punnett.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  // Electron dev tooling (wait-on + ELECTRON_START_URL) expects Vite on 5173.
  // If Vite refuses to start because 5173 is busy, stop the previous dev server
  // or kill any stray Node/Electron processes before retrying.
  server: {
    // Bind to all network interfaces (0.0.0.0) so the dev server is reachable
    // from other devices on the same LAN (e.g. http://192.168.x.x:5173).
    // localhost still works normally — this does NOT expose the app to the internet.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  define: {
    "process.env": {
      ...process.env,
      PUBLIC_URL: process.env.PUBLIC_URL ?? "",
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        inlineDynamicImports: disableCodeSplitting,
        manualChunks: disableCodeSplitting
          ? undefined
          : (id) => {
              if (!id.includes("node_modules")) return;
              if (id.includes("pdfjs-dist")) return "pdfjs";
              if (id.includes("html2canvas")) return "html2canvas";
              if (id.includes("jspdf")) return "jspdf";
              if (id.includes("xlsx")) return "xlsx";
              if (
                id.includes("react") ||
                id.includes("/scheduler/") ||
                id.includes("\\scheduler\\") ||
                id.includes("use-sync-external-store")
              ) {
                return "vendor-react";
              }
            },
      },
    },
  },
});
