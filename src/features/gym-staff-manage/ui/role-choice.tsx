"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import type { AssignableRole } from "@/entities/gym-staff";
import { cn } from "@/shared/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

/**
 * The roles the viewer may give, as a labelled radio group: each option
 * names the role and what it allows at this gym today. Only the roles the
 * backend's permission projection allows are offered; never `owner`.
 */
export function RoleChoice({
  roles,
  value,
  onChange,
  disabled,
  invalid,
  labelledBy,
}: {
  roles: readonly AssignableRole[];
  value: AssignableRole | undefined;
  onChange: (role: AssignableRole) => void;
  disabled: boolean;
  invalid?: boolean;
  labelledBy: string;
}) {
  const t = useTranslations("gymConsole");
  const id = useId();

  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      aria-invalid={invalid}
      value={value ?? ""}
      onValueChange={(next) => {
        const role = roles.find((candidate) => candidate === next);
        if (role) onChange(role);
      }}
      disabled={disabled}
      className="gap-2"
    >
      {roles.map((role) => (
        <label
          key={role}
          htmlFor={`${id}-${role}`}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3",
            "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent",
            disabled && "cursor-default opacity-60",
          )}
        >
          <RadioGroupItem id={`${id}-${role}`} value={role} className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="type-body-sm font-extrabold">{t(`switcher.roles.${role}`)}</span>
            <span className="type-caption text-muted-foreground">
              {t(`staff.roles.${role}.line`)}
            </span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
