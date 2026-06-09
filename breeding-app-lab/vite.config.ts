import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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

          // React runtime — must be isolated to avoid circular deps
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("\\react\\") ||
            id.includes("\\react-dom\\") ||
            id.includes("\\scheduler\\") ||
            id.includes("use-sync-external-store")
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
