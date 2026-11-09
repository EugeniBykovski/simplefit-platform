"use client";

import { InfoIcon, LockIcon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { useAnswerLabels, type SponsorApplicationPolicy } from "@/entities/sponsor-application";
import { countryOptions } from "@/shared/lib/countries";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Textarea } from "@/shared/ui/textarea";

import type { AnswerField } from "../model/steps";
import { CITY_MAX, GOALS_MAX, type ApplicationValues } from "../model/values";
import { ChoicePills } from "./choice-pills";

/*
 * The answer steps of SPA1 (SP1–SP6): each renders its fields from the one
 * application form (react-hook-form context). Options come from the
 * backend policy; what is required for submission is the backend's
 * `missing_fields`, shown by the flow. After a change request only the
 * requested answers can change (`locked` greys the rest).
 */

export type FieldsProps = {
  /** The translated error of a field, if any. */
  error: (field: AnswerField) => string | undefined;
  /** Whether a field can't change now (not part of an open change request). */
  locked: (field: AnswerField) => boolean;
  policy: SponsorApplicationPolicy;
};

export const fieldId = (field: AnswerField) => `sa-${field}`;

function useLabels() {
  return { t: useTranslations("sponsorApplication.fields") };
}

function TextField({
  field,
  label,
  type = "text",
  autoComplete,
  help,
  required,
  inputMode,
  props,
}: {
  field: AnswerField & keyof ApplicationValues;
  label: string;
  type?: "text" | "email" | "tel" | "url";
  autoComplete?: string;
  help?: string;
  required: boolean;
  inputMode?: "url" | "email" | "tel" | "text";
  props: FieldsProps;
}) {
  const { register } = useFormContext<ApplicationValues>();
  const id = fieldId(field);
  const error = props.error(field);
  return (
    <FormField id={id} label={label} error={error} help={help} required={required}>
      <Input
        id={id}
        type={type}
        fieldSize="lg"
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-required={required}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined || help !== undefined ? describedBy(id) : undefined}
        disabled={props.locked(field)}
        {...register(field)}
      />
    </FormField>
  );
}

function LockedNote({ show }: { show: boolean }) {
  const t = useTranslations("sponsorApplication.changes");
  if (!show) return null;
  return (
    <p className="flex items-center gap-1.5 type-caption text-faint-foreground">
      <LockIcon aria-hidden className="size-3.5" />
      {t("locked")}
    </p>
  );
}

/** SP1 Company: name, website, country, (logo, rendered by the flow), industry. */
export function CompanyFields({ props, logo }: { props: FieldsProps; logo?: React.ReactNode }) {
  const { t } = useLabels();
  const codes = useAnswerLabels();
  const locale = useLocale();
  const { control } = useFormContext<ApplicationValues>();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
  const countryError = props.error("country_code");
  const industryError = props.error("industry");

  return (
    <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextField
          field="company_name"
          label={t("companyName")}
          autoComplete="organization"
          required
          props={props}
        />
        <TextField
          field="website"
          type="url"
          inputMode="url"
          autoComplete="url"
          label={`${t("website")} · ${t("optional")}`}
          help={t("websiteHelp")}
          required={false}
          props={props}
        />
        <FormField id={fieldId("country_code")} label={t("country")} error={countryError} required>
          <Controller
            control={control}
            name="country_code"
            render={({ field }) => (
              <Combobox
                id={fieldId("country_code")}
                value={field.value === "" ? null : field.value}
                onValueChange={field.onChange}
                options={countries}
                placeholder={t("countryPlaceholder")}
                searchLabel={t("countrySearch")}
                emptyLabel={t("countryEmpty")}
                invalid={countryError !== undefined}
                disabled={props.locked("country_code")}
                aria-describedby={
                  countryError === undefined ? undefined : describedBy(fieldId("country_code"))
                }
              />
            )}
          />
        </FormField>
        {logo ?? null}
      </div>
      <ChoiceField id={fieldId("industry")} legend={t("industry")} error={industryError} required>
        <Controller
          control={control}
          name="industry"
          render={({ field }) => (
            <ChoicePills
              name="industry"
              type="radio"
              value={field.value}
              onChange={field.onChange}
              disabled={props.locked("industry")}
              options={props.policy.industries.map((code) => ({
                value: code,
                label: codes.industry(code),
              }))}
            />
          )}
        />
      </ChoiceField>
      <LockedNote show={props.locked("company_name") && props.locked("industry")} />
    </>
  );
}

/** SP2 Contact person. */
export function ContactFields({ props }: { props: FieldsProps }) {
  const { t } = useLabels();
  return (
    <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextField
          field="contact_full_name"
          label={t("fullName")}
          autoComplete="name"
          required
          props={props}
        />
        <TextField
          field="contact_position"
          label={t("position")}
          autoComplete="organization-title"
          required
          props={props}
        />
        <TextField
          field="contact_email"
          type="email"
          inputMode="email"
          autoComplete="email"
          label={t("workEmail")}
          help={t("workEmailHelp")}
          required
          props={props}
        />
        <TextField
          field="contact_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label={`${t("phone")} · ${t("optional")}`}
          help={t("phoneHelp")}
          required={false}
          props={props}
        />
      </div>
      <Notice tone="muted" icon={LockIcon}>
        {t("contactPrivacy")}
      </Notice>
    </>
  );
}

/** SP3 Partnership interests. */
export function InterestsFields({ props }: { props: FieldsProps }) {
  const { t } = useLabels();
  const codes = useAnswerLabels();
  const { control } = useFormContext<ApplicationValues>();
  return (
    <>
      <ChoiceField
        id={fieldId("interests")}
        legend={t("interests")}
        error={props.error("interests")}
        required
      >
        <p id="sa-interests-help" className="type-caption text-muted-foreground">
          {t("interestsHelp")}
        </p>
        <Controller
          control={control}
          name="interests"
          render={({ field }) => (
            <ChoicePills
              name="interests"
              type="checkbox"
              value={field.value}
              onChange={field.onChange}
              disabled={props.locked("interests")}
              describedBy="sa-interests-help"
              options={props.policy.interests.map((code) => ({
                value: code,
                label: codes.interest(code),
              }))}
            />
          )}
        />
      </ChoiceField>
      <Notice tone="muted" icon={InfoIcon}>
        {t("sponsoredLabel")}
      </Notice>
    </>
  );
}

/** SP4 Markets: scope, countries, focus cities. A global scope names neither. */
export function MarketsFields({ props }: { props: FieldsProps }) {
  const { t } = useLabels();
  const codes = useAnswerLabels();
  const locale = useLocale();
  const { control, setValue } = useFormContext<ApplicationValues>();
  const scope = useWatch({ control, name: "market_scope" });
  const countries = useWatch({ control, name: "market_countries" });
  const cities = useWatch({ control, name: "market_cities" });
  const [city, setCity] = useState("");
  const options = useMemo(
    () =>
      countryOptions(locale)
        .filter(({ code }) => !countries.includes(code))
        .map(({ code, name }) => ({ value: code, label: name })),
    [locale, countries],
  );
  const lockedLists = props.locked("market_countries") && props.locked("market_cities");
  const set = (name: "market_countries" | "market_cities", next: string[]) =>
    setValue(name, next, { shouldDirty: true, shouldValidate: false });

  const addCity = () => {
    const name = city.trim();
    if (name === "" || name.length > CITY_MAX || cities.includes(name)) return;
    set("market_cities", [...cities, name]);
    setCity("");
  };

  return (
    <>
      <ChoiceField
        id={fieldId("market_scope")}
        legend={t("scope")}
        error={props.error("market_scope")}
        required
      >
        <Controller
          control={control}
          name="market_scope"
          render={({ field }) => (
            <ChoicePills
              name="market_scope"
              type="radio"
              value={field.value}
              disabled={props.locked("market_scope")}
              onChange={(next) => {
                field.onChange(next);
                // The policy refuses countries or cities with a global scope.
                if (next === "global") {
                  if (countries.length > 0) set("market_countries", []);
                  if (cities.length > 0) set("market_cities", []);
                }
              }}
              options={props.policy.scopes.map((code) => ({
                value: code,
                label: codes.scope(code),
              }))}
            />
          )}
        />
      </ChoiceField>

      {scope !== "" && scope !== "global" ? (
        <>
          <ChoiceField
            id={fieldId("market_countries")}
            legend={t("countries")}
            error={props.error("market_countries")}
          >
            <Chips
              items={countries.map((code) => ({ value: code, label: codes.country(code) }))}
              removeLabel={(label) => t("removeItem", { label })}
              disabled={lockedLists}
              onRemove={(code) =>
                set(
                  "market_countries",
                  countries.filter((c) => c !== code),
                )
              }
            />
            <div className="max-w-90">
              <Combobox
                id={`${fieldId("market_countries")}-add`}
                aria-label={t("addCountry")}
                value={null}
                onValueChange={(code) => set("market_countries", [...countries, code])}
                options={options}
                placeholder={t("addCountry")}
                searchLabel={t("countrySearch")}
                emptyLabel={t("countryEmpty")}
                disabled={lockedLists}
                invalid={props.error("market_countries") !== undefined}
              />
            </div>
          </ChoiceField>
          <ChoiceField
            id={fieldId("market_cities")}
            legend={scope === "cities" ? t("cities") : `${t("cities")} · ${t("optional")}`}
            error={props.error("market_cities")}
          >
            <Chips
              items={cities.map((name) => ({ value: name, label: name }))}
              removeLabel={(label) => t("removeItem", { label })}
              disabled={lockedLists}
              onRemove={(name) =>
                set(
                  "market_cities",
                  cities.filter((c) => c !== name),
                )
              }
            />
            <div className="flex max-w-120 gap-2">
              <Input
                id={`${fieldId("market_cities")}-input`}
                fieldSize="lg"
                value={city}
                maxLength={CITY_MAX}
                disabled={lockedLists}
                aria-label={t("addCity")}
                autoComplete="off"
                onChange={(event) => setCity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCity();
                  }
                }}
              />
              <Button
                type="button"
                variant="quiet"
                size="lg"
                disabled={lockedLists || city.trim() === ""}
                onClick={addCity}
              >
                {t("add")}
              </Button>
            </div>
          </ChoiceField>
        </>
      ) : null}
    </>
  );
}

function Chips({
  items,
  removeLabel,
  onRemove,
  disabled,
}: {
  items: { value: string; label: string }[];
  removeLabel: (label: string) => string;
  onRemove: (value: string) => void;
  disabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.value}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-primary-muted bg-accent ps-3.5 pe-1 type-body-sm font-bold text-accent-foreground"
        >
          {item.label}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(item.value)}
            aria-label={removeLabel(item.label)}
            className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-background/30 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <XIcon aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** SP5 Estimated budget: the policy's bands, an estimate only. */
export function BudgetFields({ props }: { props: FieldsProps }) {
  const { t } = useLabels();
  const codes = useAnswerLabels(props.policy);
  const { control } = useFormContext<ApplicationValues>();
  return (
    <>
      <ChoiceField
        id={fieldId("budget_band")}
        legend={t("budget")}
        error={props.error("budget_band")}
        required
      >
        <Controller
          control={control}
          name="budget_band"
          render={({ field }) => (
            <ChoicePills
              name="budget_band"
              type="radio"
              value={field.value}
              onChange={field.onChange}
              disabled={props.locked("budget_band")}
              options={props.policy.budget_bands.map((band) => ({
                value: band.code,
                label: codes.budget(band.code),
              }))}
            />
          )}
        />
      </ChoiceField>
      <Notice tone="muted" icon={InfoIcon}>
        <b>{t("budgetNoteTitle")}</b> {t("budgetNote")}
      </Notice>
    </>
  );
}

/** SP6 Goals, up to 2,000 characters. */
export function GoalsFields({ props }: { props: FieldsProps }) {
  const { t } = useLabels();
  const format = useFormatter();
  const { register, control } = useFormContext<ApplicationValues>();
  const goals = useWatch({ control, name: "goals" });
  const id = fieldId("goals");
  const error = props.error("goals");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {t("goals")}
        <span aria-hidden className="text-warning">
          {" *"}
        </span>
      </label>
      <Textarea
        id={id}
        rows={6}
        placeholder={t("goalsPlaceholder")}
        aria-required
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-count${error === undefined ? "" : ` ${describedBy(id)}`}`}
        disabled={props.locked("goals")}
        className="min-h-36 type-body"
        {...register("goals")}
      />
      <span id={`${id}-count`} className="self-end type-caption text-muted-foreground">
        {t("goalsCount", {
          count: format.number(goals.length),
          max: format.number(GOALS_MAX),
        })}
      </span>
      {error !== undefined ? (
        <p id={describedBy(id)} className="type-caption text-destructive-subtle-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
