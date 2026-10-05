// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Providers } from "./providers";

/*
 * Server half of the theme-script regression (see providers.test.tsx): the
 * server HTML must carry next-themes' executable initialisation script, so
 * the stored or default (dark) theme is applied before first paint.
 */
describe("Providers theme script (server render)", () => {
  it("renders an executable theme script with the dark default and storage key", () => {
    const html = renderToString(
      <Providers>
        <p>content</p>
      </Providers>,
    );

    const script = /<script\b([^>]*)>([\s\S]*?)<\/script>/.exec(html);
    expect(script).not.toBeNull();
    expect(script?.[1]).toContain('type="text/javascript"');
    expect(script?.[2]).toContain("simplefit-theme");
    expect(script?.[2]).toContain("dark");
    expect(html).toContain("content");
  });
});
