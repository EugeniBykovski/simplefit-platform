import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_API_URL: "http://api.test",
    },
    server: {
      deps: {
        // next-intl imports "next/navigation" and "next/server" without file
        // extensions, which Node's ESM resolver rejects. Let Vite resolve it.
        inline: ["next-intl"],
      },
    },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
