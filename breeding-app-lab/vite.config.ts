import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pre-transform plugin: the shared config file uses `(import.meta as any)?.env?.VITE_API_URL`
// (TypeScript optional-chaining cast). Vite's static import.meta.env replacement does NOT
// recognise the `?.` form, so the value is never baked in. This plugin rewrites the pattern
// to a plain string literal before esbuild sees the file.
function patchImportMetaEnv(): import("vite").Plugin {
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

export default defineConfig({
  plugins: [patchImportMetaEnv(), react()],
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
