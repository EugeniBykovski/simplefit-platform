import { appLinksEnv, assetLinks, ASSOCIATION_HEADERS } from "@/shared/config/app-links";

/**
 * Android verified App Links (SF-80, see `@/shared/config/app-links`): served
 * at the exact well-known path, as JSON, without redirects or authentication;
 * 404 while no signing-certificate fingerprint is configured.
 * Read per request (Route Handlers are not cached).
 */
export function GET() {
  const { androidCertSha256 } = appLinksEnv();
  if (androidCertSha256.length === 0) return new Response(null, { status: 404 });
  return Response.json(assetLinks(androidCertSha256), { headers: ASSOCIATION_HEADERS });
}
