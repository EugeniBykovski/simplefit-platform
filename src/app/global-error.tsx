"use client";

import { NextIntlClientProvider } from "next-intl";

import { routing } from "@/shared/i18n/routing";
import { fontVariables } from "@/shared/styles/fonts";
import { Container } from "@/shared/ui/container";
import { ErrorState, failureFor } from "@/widgets/system-states";

import actions from "../../messages/en/actions.json";
import errors from "../../messages/en/errors.json";
import "./globals.css";

/**
 * Last-resort boundary (SF-34): replaces the root layout when it fails, so
 * it renders its own document, in the default locale with the English
 * messages bundled here (no request or provider is available). Shows the
 * failure state only: never the error's message, digest or stack. A 401
 * cannot be routed from here and shows the unexpected state.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const failure = failureFor(error);

  return (
    <html lang={routing.defaultLocale} className={`dark ${fontVariables}`}>
      <body>
        <NextIntlClientProvider locale={routing.defaultLocale} messages={{ actions, errors }}>
          <main className="flex min-h-dvh flex-col bg-background text-foreground">
            <Container className="flex flex-1 items-center justify-center py-14">
              <ErrorState
                kind={failure === "unauthorized" ? "unexpected" : failure}
                onRetry={reset}
              />
            </Container>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
