// vitest/config, not vite: the `test` key below only exists on Vitest's
// defineConfig. Importing from "vite" type-errors on it.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The SPA talks to Django in development. In production both are served
      // from the same origin, so this proxy has no production equivalent.
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
