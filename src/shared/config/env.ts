import { z } from "zod";

/** A Google OAuth client ID (public, but validated so a typo fails loudly). */
const GOOGLE_CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

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
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(
      z
        .string()
        .regex(GOOGLE_CLIENT_ID, {
          error: "NEXT_PUBLIC_GOOGLE_CLIENT_ID must be a Google OAuth client ID",
        })
        .optional(),
    )
    .optional(),
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
});
