import type { formats } from "./formats";
import type { Messages } from "./messages";
import type { Locale } from "./routing";

// Strongly types locales, message keys and named formats for next-intl APIs.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
    Formats: typeof formats;
  }
}
