import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const resolveBase = (publicUrl: string | undefined): string => {
  if (!publicUrl) {
    return "/";
  }

  try {
    const { pathname } = new URL(publicUrl, "http://localhost");
    if (!pathname || pathname === "/") {
      return "/";
    }
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
  } catch {
    return publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`;
  }
};

const base = resolveBase(process.env.PUBLIC_URL);

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
