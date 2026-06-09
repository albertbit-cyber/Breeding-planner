import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

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

function networkUrlLogger(): Plugin {
  return {
    name: "network-url-logger",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const port = (server.config.server.port as number) ?? 5173;
        const lanIp = getLanIp();
        process.stdout.write(
          `\n  \x1b[1mDev server ready\x1b[0m\n` +
          `  Local:   \x1b[36mhttp://localhost:${port}/\x1b[0m\n` +
          (lanIp ? `  Network: \x1b[36mhttp://${lanIp}:${port}/\x1b[0m\n` : `  Network: (no external interface found)\n`) +
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
  if (!publicUrl || publicUrl === "/") return "./";
  try {
    const { pathname } = new URL(publicUrl, "http://localhost");
    if (!pathname || pathname === "/") return "./";
    return ensureTrailingSlash(pathname);
  } catch {
    return ensureTrailingSlash(publicUrl);
  }
};

const base = resolveBase(process.env.PUBLIC_URL);
const disableCodeSplitting = process.env.ELECTRON_BUILD === "true";

export default defineConfig({
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
  server: {
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
              if (id.includes("react")) return "vendor-react";
              return "vendor";
            },
      },
    },
  },
});
