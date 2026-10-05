import { getRequestConfig } from "next-intl/server";

import { defaultTimeZone, formats } from "./formats";
import { loadMessages } from "./messages";
import { resolveLocale } from "./routing";

/** Per-request i18n configuration, loaded on the server (registered in next.config.ts). */
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = resolveLocale(await requestLocale);

  return {
    locale,
    messages: await loadMessages(locale),
    formats,
    timeZone: defaultTimeZone,
  };
});
