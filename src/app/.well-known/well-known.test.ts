import { afterEach, describe, expect, it, vi } from "vitest";

import { appleAppSiteAssociation, assetLinks } from "@/shared/config/app-links";

import { GET as appleAssociation } from "./apple-app-site-association/route";
import { GET as androidAssociation } from "./assetlinks.json/route";

// Test values only: shaped like the real identifiers, belonging to nobody.
const TEAM_ID = "TEST0SF080";
const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0"))
  .join(":")
  .toUpperCase();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("well-known routes (SF-80)", () => {
  it("serve nothing while unconfigured", () => {
    vi.stubEnv("APP_LINKS_APPLE_TEAM_ID", "");
    vi.stubEnv("APP_LINKS_ANDROID_CERT_SHA256", "");
    expect(appleAssociation().status).toBe(404);
    expect(androidAssociation().status).toBe(404);
  });

  it("serve the configured documents as JSON", async () => {
    vi.stubEnv("APP_LINKS_APPLE_TEAM_ID", TEAM_ID);
    vi.stubEnv("APP_LINKS_ANDROID_CERT_SHA256", FINGERPRINT);

    const apple = appleAssociation();
    expect(apple.status).toBe(200);
    expect(apple.headers.get("content-type")).toBe("application/json");
    expect(apple.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await apple.json()).toEqual(appleAppSiteAssociation(TEAM_ID));

    const android = androidAssociation();
    expect(android.status).toBe(200);
    expect(android.headers.get("content-type")).toBe("application/json");
    expect(await android.json()).toEqual(assetLinks([FINGERPRINT]));
  });

  it("fail loudly on a malformed configuration instead of publishing it", () => {
    vi.stubEnv("APP_LINKS_APPLE_TEAM_ID", "not-a-team");
    expect(() => appleAssociation()).toThrow(/APP_LINKS_APPLE_TEAM_ID/);
  });
});
