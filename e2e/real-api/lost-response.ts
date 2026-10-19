import { createServer, request, type IncomingMessage, type Server } from "node:http";

import type { Page } from "@playwright/test";

/*
 * A real lost refresh response for the real-API specs (SF-75). The page's
 * `POST /api/auth/session/refresh` is redirected to this local proxy, which
 * forwards it to the API (the API commits the rotation and answers with a new
 * cookie) and then holds the answer until the browser hangs up, so the
 * browser never receives that Set-Cookie: exactly what happens when a page is
 * unloaded mid-refresh. The browser's own network stack and cookie jar handle
 * the request (cookies ignore ports), unlike `route.fetch()`, whose response
 * cookies some engines store before the test can hold them.
 *
 * Only the method, path and status are recorded; never a header or a body.
 */

export type LostResponse = {
  /** Resolves once the API has committed a rotation whose answer is held. */
  committed: Promise<void>;
  /** What happened to the held answer: lost when the browser hung up first. */
  outcome: () => "pending" | "lost" | "delivered";
  close: () => Promise<void>;
};

const REFRESH = "/api/auth/session/refresh";

export async function loseNextRefreshResponse(page: Page, apiUrl: string): Promise<LostResponse> {
  const api = new URL(apiUrl);
  let outcome: "pending" | "lost" | "delivered" = "pending";
  let held = false;
  let onCommitted: () => void = () => undefined;
  const committed = new Promise<void>((resolve) => {
    onCommitted = resolve;
  });

  const server: Server = createServer((incoming, outgoing) => {
    const body: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => body.push(chunk));
    incoming.on("end", () => {
      const hold = !held && incoming.method === "POST";
      if (hold) held = true;
      const upstream = request(
        {
          host: api.hostname,
          port: api.port,
          method: incoming.method,
          path: incoming.url,
          headers: { ...incoming.headers, host: api.host },
        },
        (answer: IncomingMessage) => {
          const chunks: Buffer[] = [];
          answer.on("data", (chunk: Buffer) => chunks.push(chunk));
          answer.on("end", () => {
            const deliver = () => {
              outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
              outgoing.end(Buffer.concat(chunks));
            };
            if (!hold) return deliver();
            // The API has rotated the token. Keep the answer until the
            // browser abandons the request (the page navigated away).
            if (outgoing.destroyed || incoming.socket.destroyed) outcome = "lost";
            else
              outgoing.on("close", () => {
                if (!outgoing.writableFinished) outcome = "lost";
              });
            onCommitted();
          });
        },
      );
      upstream.on("error", () => outgoing.destroy());
      upstream.end(Buffer.concat(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("proxy did not start");
  const proxy = `http://127.0.0.1:${address.port}`;

  await page.route(`**${REFRESH}`, async (route) => {
    if (held) return route.continue();
    return route.continue({ url: `${proxy}${REFRESH}` });
  });

  return {
    committed,
    outcome: () => outcome,
    close: async () => {
      // The page may already be closed (a closed tab is one way to lose it).
      await page.unroute(`**${REFRESH}`).catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
