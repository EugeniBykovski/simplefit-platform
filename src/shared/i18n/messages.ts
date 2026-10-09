import type accountRegistration from "../../../messages/en/accountRegistration.json";
import type actions from "../../../messages/en/actions.json";
import type apiHealth from "../../../messages/en/apiHealth.json";
import type app from "../../../messages/en/app.json";
import type auth from "../../../messages/en/auth.json";
import type common from "../../../messages/en/common.json";
import type errors from "../../../messages/en/errors.json";
import type fighterHome from "../../../messages/en/fighterHome.json";
import type fighterOnboarding from "../../../messages/en/fighterOnboarding.json";
import type home from "../../../messages/en/home.json";
import type navigation from "../../../messages/en/navigation.json";
import type roleSelection from "../../../messages/en/roleSelection.json";
import type routes from "../../../messages/en/routes.json";
import type shells from "../../../messages/en/shells.json";
import type system from "../../../messages/en/system.json";
import type theme from "../../../messages/en/theme.json";

import { defaultLocale, fallbackChain, type Locale } from "./routing";

/**
 * Message namespaces, one JSON file each under messages/<locale>/.
 * Generic: common, navigation, actions, errors. Others belong to one screen
 * or slice and are named after it.
 */
export const namespaces = [
  "common",
  "navigation",
  "actions",
  "errors",
  "home",
  "app",
  "auth",
  "apiHealth",
  "theme",
  "routes",
  "shells",
  "system",
  "fighterOnboarding",
  "accountRegistration",
  "roleSelection",
  "fighterHome",
] as const;

export type Namespace = (typeof namespaces)[number];

/** Message shape, defined by the English (source) messages. */
export type Messages = {
  common: typeof common;
  navigation: typeof navigation;
  actions: typeof actions;
  errors: typeof errors;
  home: typeof home;
  app: typeof app;
  auth: typeof auth;
  apiHealth: typeof apiHealth;
  theme: typeof theme;
  routes: typeof routes;
  shells: typeof shells;
  system: typeof system;
  fighterOnboarding: typeof fighterOnboarding;
  accountRegistration: typeof accountRegistration;
  roleSelection: typeof roleSelection;
  fighterHome: typeof fighterHome;
};

export type MessageTree = { [key: string]: string | MessageTree };

export type LocaleMessages = Partial<Record<Namespace, MessageTree>>;

/**
 * Reads the raw messages of one locale, without fallback. Locales that declare
 * a fallback may omit namespace files (they inherit them); for every other
 * locale a missing file is an error.
 */
export async function loadLocaleMessages(locale: Locale): Promise<LocaleMessages> {
  const inherits = fallbackChain(locale).length > 1 && locale !== defaultLocale;
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      try {
        const file = (await import(`../../../messages/${locale}/${namespace}.json`)) as {
          default: MessageTree;
        };
        return [namespace, file.default] as const;
      } catch (error) {
        if (inherits) return undefined;
        throw error;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined)) as LocaleMessages;
}

/**
 * Messages for a locale, resolved through its fallback chain (es-MX -> es ->
 * en): every key renders text from the most specific locale that defines it,
 * so English is the final fallback and never a raw key.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const layers = await Promise.all(fallbackChain(locale).reverse().map(loadLocaleMessages));
  return layers.reduce<MessageTree>(
    (merged, layer) => withFallback(merged, layer as MessageTree),
    {},
  ) as unknown as Messages;
}

/** Deep-merges `override` onto `base`; keys missing from `override` keep the base text. */
export function withFallback(base: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] =
      typeof value === "object" && typeof baseValue === "object"
        ? withFallback(baseValue, value)
        : value;
  }
  return result;
}
