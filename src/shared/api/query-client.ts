import { isServer, QueryClient } from "@tanstack/react-query";

import { isApiError } from "./http/api-error";

const MAX_RETRIES = 2;

/** Client errors (4xx) are deterministic: retrying will not change the answer. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid an immediate client refetch of data that was just rendered.
        staleTime: 60_000,
        retry: shouldRetry,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * One QueryClient per request on the server (never shared between users), and
 * a single long-lived client in the browser.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
