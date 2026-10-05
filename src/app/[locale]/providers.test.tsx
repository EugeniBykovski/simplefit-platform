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
