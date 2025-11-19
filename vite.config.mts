import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const disableCodeSplitting = true;

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  // Electron dev tooling (wait-on + ELECTRON_START_URL) expects Vite on 5173.
  // If Vite refuses to start because 5173 is busy, stop the previous dev server
  // or kill any stray Node/Electron processes before retrying.
  server: {
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
