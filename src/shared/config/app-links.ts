/**
 * Verified invitation links (SF-80; simplefit-mobile docs/invitation-app-links.md).
 *
 * The E08 email links to `<this origin>/invite/coach#token=…` (SF-57). The
 * SimpleFit Boxing app may open that one path instead of the browser when
 * this domain says so in two association files:
 *
 * - `/.well-known/apple-app-site-association` (iOS Universal Links) names the
 *   app as `<Apple Team ID>.com.simplefit.boxing`;
 * - `/.well-known/assetlinks.json` (Android verified App Links) names the
 *   package and the SHA-256 fingerprints of the certificates that sign it.
 *
 * Both are public by design (anyone can read them), so these are server
 * variables only because they are read per request, not secrets. Unset, the
 * files are not served (404): no app is associated and every invitation link
 * opens the web page, which is always the fallback. The values come from the
 * Apple Developer team and the signing keys (debug, EAS, Play App Signing);
 * never placeholders.
 *
 *   APP_LINKS_APPLE_TEAM_ID         e.g. the 10-character Team ID
 *   APP_LINKS_ANDROID_CERT_SHA256   comma-separated `AB:CD:…` (32 bytes each)
 */

/** The app identity both platforms use (simplefit-mobile app.config.ts, permanent). */
export const APP_ID = "com.simplefit.boxing";

/** The only path the app claims: the E08 invitation link. */
export const INVITATION_LINK_PATH = "/invite/coach";

const TEAM_ID = /^[A-Z0-9]{10}$/;
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

export type AppLinksEnv = {
  appleTeamId: string | undefined;
  androidCertSha256: string[];
};

type AppLinksEnvSource = {
  APP_LINKS_APPLE_TEAM_ID?: string | undefined;
  APP_LINKS_ANDROID_CERT_SHA256?: string | undefined;
};

/** The validated association settings; a malformed value fails loudly. */
export function parseAppLinksEnv(source: AppLinksEnvSource): AppLinksEnv {
  const teamId = source.APP_LINKS_APPLE_TEAM_ID?.trim() ?? "";
  if (teamId !== "" && !TEAM_ID.test(teamId)) {
    throw new Error("APP_LINKS_APPLE_TEAM_ID must be a 10-character Apple Team ID");
  }
  const fingerprints = (source.APP_LINKS_ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");
  for (const fingerprint of fingerprints) {
    if (!SHA256_FINGERPRINT.test(fingerprint)) {
      throw new Error(
        "APP_LINKS_ANDROID_CERT_SHA256 must list SHA-256 certificate fingerprints (AB:CD:…, 32 bytes)",
      );
    }
  }
  return {
    appleTeamId: teamId === "" ? undefined : teamId,
    androidCertSha256: [...new Set(fingerprints)],
  };
}

/** Read per request (the deployment's environment, not the build's). */
export function appLinksEnv(): AppLinksEnv {
  return parseAppLinksEnv({
    APP_LINKS_APPLE_TEAM_ID: process.env.APP_LINKS_APPLE_TEAM_ID,
    APP_LINKS_ANDROID_CERT_SHA256: process.env.APP_LINKS_ANDROID_CERT_SHA256,
  });
}

/**
 * The apple-app-site-association document: the app handles exactly
 * `/invite/coach` (any query or fragment; the app never reads the fragment)
 * and nothing else on this domain.
 */
export function appleAppSiteAssociation(teamId: string) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: [{ "/": INVITATION_LINK_PATH, comment: "E08 coach invitation (SF-80)" }],
        },
      ],
    },
  };
}

/** The Digital Asset Links statement list for verified App Links. */
export function assetLinks(fingerprints: readonly string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_ID,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}

/**
 * Response headers of both files: JSON, cacheable for a short while (the
 * platforms fetch them through their own CDNs), never indexed.
 */
export const ASSOCIATION_HEADERS = {
  "cache-control": "public, max-age=3600",
  "x-robots-tag": "noindex",
} as const;
