import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "node_modules/**",
      "dist/**",
      "src/genetics/punnett.test.ts",
      "src/features/lab/utils/labelLayout.test.js",
      "src/services/lab/geneticsUpdateEngine.test.ts",
    ],
  },
});
