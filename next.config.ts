import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Registers the per-request i18n configuration (locale, messages, formats).
const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

/**
 * Response headers for every page (SF-132). No page may be framed: the Control
 * Plane and the partner portal are signed in from the HttpOnly refresh cookie,
 * so a framing page could otherwise drive privileged actions (clickjacking).
 * `frame-ancestors` is the CSP form, `X-Frame-Options` the legacy one. HSTS is
 * ignored by browsers over plain HTTP (local development).
 */
export const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  experimental: {
    // The root layout lives under the dynamic [locale] segment, which is the
    // case Next.js documents global-not-found for (app/global-not-found.tsx).
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
