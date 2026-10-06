import { z } from "zod";

/** A Google OAuth client ID (public, but validated so a typo fails loudly). */
const GOOGLE_CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/** An Apple Services ID (reverse-DNS identifier). */
const APPLE_SERVICES_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Optional public value: blank means "not configured"; otherwise it must pass `schema`. */
const optional = (schema: z.ZodString | z.ZodURL) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(schema.optional())
    .optional();

/**
 * Public runtime configuration.
 *
 * NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
 * they must never hold secrets. Next.js only inlines them when each variable is
 * read as a literal `process.env.NEXT_PUBLIC_*` expression, as below.
 *
 * Server-only variables belong in a separate module that starts with
 * `import "server-only"` (see docs/architecture/README.md#environment).
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .url({ protocol: /^https?$/, error: "NEXT_PUBLIC_API_URL must be an http(s) URL" })
    .transform((url) => url.replace(/\/+$/, "")),
  // The Google Web client ID (ADR 0013 in simplefit-api). Optional: without it
  // Google sign-in reports itself unavailable instead of rendering the button.
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: optional(
    z.string().regex(GOOGLE_CLIENT_ID, {
      error: "NEXT_PUBLIC_GOOGLE_CLIENT_ID must be a Google OAuth client ID",
    }),
  ),
  // Sign in with Apple (ADR 0014 in simplefit-api): the web Services ID and
  // the HTTPS Return URL registered for it. Optional: without both, Apple
  // sign-in reports itself unavailable (Apple never accepts localhost).
  NEXT_PUBLIC_APPLE_SERVICES_ID: optional(
    z.string().regex(APPLE_SERVICES_ID, {
      error: "NEXT_PUBLIC_APPLE_SERVICES_ID must be an Apple Services ID",
    }),
  ),
  NEXT_PUBLIC_APPLE_REDIRECT_URI: optional(
    z.url({
      protocol: /^https$/,
      error: "NEXT_PUBLIC_APPLE_REDIRECT_URI must be an https URL",
    }),
  ),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_APPLE_SERVICES_ID: process.env.NEXT_PUBLIC_APPLE_SERVICES_ID,
  NEXT_PUBLIC_APPLE_REDIRECT_URI: process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI,
});
