import {
  appLinksEnv,
  appleAppSiteAssociation,
  ASSOCIATION_HEADERS,
} from "@/shared/config/app-links";

/**
 * iOS Universal Links association (SF-80, see `@/shared/config/app-links`):
 * served at the exact well-known path, as JSON, without redirects or
 * authentication; 404 while no Apple Team ID is configured.
 * Read per request (Route Handlers are not cached).
 */
export function GET() {
  const { appleTeamId } = appLinksEnv();
  if (appleTeamId === undefined) return new Response(null, { status: 404 });
  return Response.json(appleAppSiteAssociation(appleTeamId), { headers: ASSOCIATION_HEADERS });
}
