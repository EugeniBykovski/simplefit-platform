import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { defaultTimeZone, formats } from "@/shared/i18n/formats";
import { loadMessages } from "@/shared/i18n/messages";
import { defaultLocale, type Locale } from "@/shared/i18n/routing";

type Options = RenderOptions & { locale?: Locale; queryClient?: QueryClient };

/**
 * Renders UI the way the app does: real messages for `locale` (with English
 * fallback), named formats, and a fresh QueryClient with retries disabled.
 */
export async function renderWithProviders(
  ui: ReactElement,
  { locale = defaultLocale, queryClient = testQueryClient(), ...options }: Options = {},
) {
  const messages = await loadMessages(locale);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        formats={formats}
        timeZone={defaultTimeZone}
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/** A fetch Response with a JSON body. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}
