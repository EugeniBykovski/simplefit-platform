import { expect, test } from "@playwright/test";

/*
 * SF-132: every page of the production build answers with the security
 * headers (next.config.ts): no framing (clickjacking of the signed-in Control
 * Plane or partner portal), no MIME sniffing, a strict referrer policy and HSTS.
 */

const PAGES = [
  "/en",
  "/en/login",
  "/en/admin",
  "/en/admin/sponsors",
  "/en/sponsor/4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60/requests",
  "/en/partners/apply",
];

for (const path of PAGES) {
  test(`${path} can't be framed and carries the security headers`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });
}

test("a framing page gets nothing of the Control Plane", async ({ page }) => {
  await page.setContent(
    `<iframe id="f" src="http://127.0.0.1:3100/en/admin" allow="publickey-credentials-get"></iframe>`,
  );
  await page.waitForTimeout(1500);
  const frame = page.frames().find((candidate) => candidate.url().includes("/en/admin"));
  // Blocked frames never load the document: no frame, or an empty one.
  const body = frame
    ? await frame
        .locator("body")
        .innerText()
        .catch(() => "")
    : "";
  expect(body).toBe("");
});

for (const path of ["/en/admin", "/en/admin/users", "/en/admin/flags", "/en/admin/audit"]) {
  test(`${path} tells robots not to index it`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });
}
