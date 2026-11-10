"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

/** A required reason code, from the backend's list for this read or action (SF-122). */
export function ReasonSelect({
  id,
  label,
  placeholder,
  reasons,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  reasons: readonly string[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("controlPlane.users.reasons");
  const name = (code: string) =>
    t.has(code as Parameters<typeof t.has>[0]) ? t(code as Parameters<typeof t>[0]) : code;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>
        {label} <span aria-hidden>*</span>
      </Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled} required>
        <SelectTrigger id={id} className="h-11 w-full" aria-required="true">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {reasons.map((code) => (
            <SelectItem key={code} value={code}>
              {name(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
