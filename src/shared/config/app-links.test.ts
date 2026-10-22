import { describe, expect, it } from "vitest";

import { appleAppSiteAssociation, assetLinks, parseAppLinksEnv } from "./app-links";

// Test values only: shaped like the real identifiers, belonging to nobody.
const TEAM_ID = "TEST0SF080";
const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0"))
  .join(":")
  .toUpperCase();

describe("app link association settings (SF-80)", () => {
  it("is empty by default: nothing is associated", () => {
    expect(parseAppLinksEnv({})).toEqual({ appleTeamId: undefined, androidCertSha256: [] });
    expect(
      parseAppLinksEnv({ APP_LINKS_APPLE_TEAM_ID: " ", APP_LINKS_ANDROID_CERT_SHA256: " , " }),
    ).toEqual({ appleTeamId: undefined, androidCertSha256: [] });
  });

  it("accepts a Team ID and several certificate fingerprints", () => {
    expect(
      parseAppLinksEnv({
        APP_LINKS_APPLE_TEAM_ID: ` ${TEAM_ID} `,
        APP_LINKS_ANDROID_CERT_SHA256: `${FINGERPRINT.toLowerCase()}, ${FINGERPRINT}`,
      }),
    ).toEqual({ appleTeamId: TEAM_ID, androidCertSha256: [FINGERPRINT] });
  });

  it.each([
    [{ APP_LINKS_APPLE_TEAM_ID: "short" }, /APP_LINKS_APPLE_TEAM_ID/],
    [{ APP_LINKS_APPLE_TEAM_ID: `${TEAM_ID}.com.simplefit.boxing` }, /APP_LINKS_APPLE_TEAM_ID/],
    [{ APP_LINKS_ANDROID_CERT_SHA256: "AB:CD" }, /APP_LINKS_ANDROID_CERT_SHA256/],
    [{ APP_LINKS_ANDROID_CERT_SHA256: FINGERPRINT.replaceAll(":", "") }, /SHA256/],
  ])("rejects a malformed value %o", (source, error) => {
    expect(() => parseAppLinksEnv(source)).toThrow(error);
  });
});

describe("association documents (SF-80)", () => {
  it("claims only the invitation path for this app", () => {
    expect(appleAppSiteAssociation(TEAM_ID)).toEqual({
      applinks: {
        details: [
          {
            appIDs: [`${TEAM_ID}.com.simplefit.boxing`],
            components: [{ "/": "/invite/coach", comment: "E08 coach invitation (SF-80)" }],
          },
        ],
      },
    });
  });

  it("names the package and its signing certificates", () => {
    expect(assetLinks([FINGERPRINT])).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.simplefit.boxing",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });
});
