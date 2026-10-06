import { redirect } from "@/shared/i18n/navigation";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { routeHref } from "@/shared/routes/routes";

/** `web.app.camp` (REDIRECT): the section entry always opens `web.app.camp.board`. */
export default async function CampRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocaleParam(params);
  redirect({ href: routeHref("web.app.camp.board"), locale });
}
