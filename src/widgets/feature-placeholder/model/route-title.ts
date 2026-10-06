import type { Messages } from "@/shared/i18n/messages";
import type { WebRouteId } from "@/shared/routes/routes";

export type RouteTitleKey = keyof Messages["routes"]["titles"];

/**
 * The `routes.titles` message key of a route: its id with "." replaced by
 * "/" (next-intl reserves "." for nesting). Every route rendered by the
 * placeholder has a title in every locale (tested).
 */
export function routeTitleKey(id: WebRouteId): RouteTitleKey {
  return id.replaceAll(".", "/") as RouteTitleKey;
}
