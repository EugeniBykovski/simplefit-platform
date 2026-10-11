import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "./providers";

/*
 * Regression for the theme-initialisation script (SF-17). next-themes renders
 * its pre-hydration <script> from this Client Component. That script must be
 * executable in the server HTML (no theme flash) and inert when the provider
 * mounts on the client, e.g. after a locale navigation remounts the [locale]
 * layout. A client-created executable <script> never runs, and React 19
 * reports it as "Encountered a script tag while rendering React component".
 */
describe("Providers theme script", () => {
  it("mounts on the client without creating an executable <script>", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <Providers>
        <p>content</p>
      </Providers>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Encountered a script tag"),
    );
    for (const script of container.querySelectorAll("script")) {
      expect(script.type).toBe("application/json");
    }
  });
});

/*
 * SF-28: the query cache belongs to the signed-in user. The real session
 * module runs the providers' boundary listener on sign-out and sign-in, so a
 * cached profile never survives into the next session.
 */
describe("Providers session-scoped cache", () => {
  it("clears the query cache when the session ends or another user signs in", async () => {
    const { getQueryClient } = await import("@/shared/api/query-client");
    const session = await import("@/entities/session");
    const { jsonResponse } = await import("@/test/render");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/api/auth/logout")
            ? new Response(null, { status: 204 })
            : jsonResponse({ user: { id: "a", created_at: "2026-10-01T10:00:00Z" } }),
        ),
      ),
    );
    render(
      <Providers>
        <p>content</p>
      </Providers>,
    );
    const client = getQueryClient();
    const tokens = {
      access_token: "sfa_a",
      access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    };

    await session.completeAuthentication(tokens);
    client.setQueryData(["/api/v1/me/fighter-profile"], { status: "completed", owner: "a" });
    await session.signOut();
    expect(client.getQueryData(["/api/v1/me/fighter-profile"])).toBeUndefined();

    client.setQueryData(["/api/v1/me/first-run"], { owner: "a" });
    await session.completeAuthentication({ ...tokens, access_token: "sfa_b" });
    expect(client.getQueryData(["/api/v1/me/first-run"])).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
