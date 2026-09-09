import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next.js fornece "server-only" no build; vitest requiere un stub.
      "server-only": fileURLToPath(
        new URL("./tests/helpers/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,mts,cts,tsx,js,mjs,cjs,jsx}"],
    exclude: ["tests/e2e/**"],
  },
});
