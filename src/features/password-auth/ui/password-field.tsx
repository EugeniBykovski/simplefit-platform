"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";

import { Input } from "@/shared/ui/input";

/**
 * A password input with a show/hide toggle: a real button with a pressed state and
 * an accessible name, next in the tab order after the field.
 */
export function PasswordField({
  id,
  label,
  autoComplete,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
}) {
  const t = useTranslations("auth.password");
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          fieldSize="lg"
          className="pr-12"
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label={visible ? t("hide") : t("show")}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          {visible ? (
            <EyeOffIcon aria-hidden className="size-4" />
          ) : (
            <EyeIcon aria-hidden className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
