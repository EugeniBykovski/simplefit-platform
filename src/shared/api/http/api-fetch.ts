import { publicEnv } from "@/shared/config/env";

import { ApiError } from "./api-error";

/**
 * HTTP transport for the Orval-generated client (configured as its mutator in
 * orval.config.ts). Works in Server Components, Route Handlers and the browser.
 *
 * - Resolves API paths against NEXT_PUBLIC_API_URL.
 * - Sends and accepts JSON only (the backend is JSON-only).
 * - Resolves with the parsed body for 2xx responses.
 * - Throws ApiError for every non-2xx response.
 *
 * Next.js caching options (`next: { revalidate, tags }`, `cache`) pass through
 * `options` unchanged when called from the server.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && options.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), { ...options, headers });
  const body = await readBody(response);

  if (!response.ok) {
    throw ApiError.fromResponse(
      response.status,
      body,
      response.headers.get("x-request-id"),
      response.headers.get("retry-after"),
    );
  }

  return body as T;
}

export function apiUrl(path: string): string {
  return new URL(path, `${publicEnv.NEXT_PUBLIC_API_URL}/`).toString();
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const text = await response.text();
  if (text === "") return undefined;

  const isJson = response.headers.get("content-type")?.includes("json") ?? false;
  if (!isJson) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Error type Orval assigns to generated hooks and query options. apiFetch
 * always throws ApiError (the documented error body is carried inside it).
 */
export type ErrorType<_ErrorBody> = ApiError;

/** Request body type Orval uses for generated request functions. */
export type BodyType<BodyData> = BodyData;
