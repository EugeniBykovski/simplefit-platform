import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Registers the per-request i18n configuration (locale, messages, formats).
const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // The root layout lives under the dynamic [locale] segment, which is the
    // case Next.js documents global-not-found for (app/global-not-found.tsx).
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
