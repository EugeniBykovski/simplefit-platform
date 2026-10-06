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
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "111111111111-webclienttest.apps.googleusercontent.com",
      NEXT_PUBLIC_APPLE_SERVICES_ID: "com.simplefit.test.web",
      NEXT_PUBLIC_APPLE_REDIRECT_URI: "https://app.simplefit.test/login",
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
