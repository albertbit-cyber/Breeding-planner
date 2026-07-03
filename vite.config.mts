import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
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

// Pre-transform plugin: shared config uses `(import.meta as any)?.env?.VITE_API_URL`.
// Vite's static import.meta.env replacement does not recognize the optional-chain cast,
// so rewrite it before esbuild sees the file.
// NOTE: apiUrl must be captured in configResolved (not at plugin-creation time) because
// Vite loads .env.{mode} files AFTER evaluating vite.config.mts. Reading
// process.env.VITE_API_URL at creation time always yields "" for mode-specific env files.
function patchImportMetaEnv(): Plugin {
  let apiUrl = "";
  return {
    name: "patch-import-meta-env-optional-chain",
    enforce: "pre",
    configResolved(config) {
      // config.env is populated from the loaded .env files for the current mode
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

// Set to true only if Electron packaging requires a single bundle.
// For web builds, code splitting dramatically reduces initial load time.
const disableCodeSplitting = process.env.ELECTRON_BUILD === "true";

export default defineConfig(({ mode }) => {
  // Android (Capacitor) serves from https://localhost/ so absolute paths work
  // and — critically — Vite only adds crossorigin to asset tags when base is
  // relative ("./").  crossorigin on a Capacitor https://localhost resource
  // triggers Android WebView CORS rejection → blank white screen.
  const isAndroidBuild = mode.startsWith("android");
  const base = isAndroidBuild ? "/" : resolveBase(process.env.PUBLIC_URL);

  return {
    base,
    plugins: [patchImportMetaEnv(), react(), networkUrlLogger()],
    test: {
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.{idea,git,cache,output,temp}/**",
        "server/**",
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
                // React + all React-dependent libs (reactflow, react-i18next, etc.) must
                // stay in ONE chunk. Splitting React into its own chunk causes a circular
                // ES-module TDZ in Android WebView: libraries extract hooks at init time
                // (e.g. `qu = React.useState`) before the React chunk finishes executing.
                return "vendor";
              },
        },
      },
    },
  };
});
