"use client";

import { GlobeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { localeName, locales, type Locale } from "@/shared/i18n/routing";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * Switches the UI language while staying on the equivalent route
 * (/en/app -> /pl/app). Keyboard accessible via the Radix menu pattern.
 */
export function LocaleSwitcher() {
  const t = useTranslations("common");
  const actions = useTranslations("actions");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next as Locale });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          aria-label={`${actions("changeLanguage")}: ${localeName(locale)}`}
        >
          <GlobeIcon aria-hidden />
          <span lang={locale}>{localeName(locale)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={switchTo}>
          {locales.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option}>
              {localeName(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
