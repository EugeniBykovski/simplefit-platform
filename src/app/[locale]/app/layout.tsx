import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";

/**
 * `web.app`: the authenticated /app frame (session gate). The workspace
 * shells below it (fighter, coach, gym, account-level pages, onboarding) add
 * their own chrome.
 */
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  await resolveLocaleParam(params);
  return <RequireSession signIn={signInRouteFor("web")}>{children}</RequireSession>;
}
