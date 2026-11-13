"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { useAnswerLabels } from "@/entities/sponsor-application";
import type { PartnershipPolicy } from "@/entities/sponsor-partnership";
import { countryOptions } from "@/shared/lib/countries";
import { Button } from "@/shared/ui/button";
import { ChoicePills } from "@/shared/ui/choice-pills";
import { Combobox } from "@/shared/ui/combobox";
import { ChoiceField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { RemovableChips } from "@/shared/ui/removable-chips";

import { CITY_MAX, type MarketValues } from "../model/values";

type MarketField = keyof MarketValues;

export type MarketFieldsProps = {
  /** Prefix of the controls' ids, unique per form on the page. */
  idPrefix: string;
  policy: PartnershipPolicy;
  /** The translated error of a field, if any. */
  error: (field: MarketField) => string | undefined;
  /** Whether a field can't change now (outside an open change request, or no write right). */
  locked: (field: MarketField) => boolean;
  /** Interests are needed before a request can be submitted (the API decides). */
  interestsRequired?: boolean;
};

/**
 * The interests and markets of a partnership form (SF-131): the policy's
 * interest codes as checkbox pills, the market scope as radio pills, then the
 * countries and cities a non-global scope names. The vocabularies come from
 * the backend policy (SF-130, the SF-113 codes); what a request still needs is
 * the backend's `missing_fields`.
 */
export function MarketFields({
  idPrefix,
  policy,
  error,
  locked,
  interestsRequired = false,
}: MarketFieldsProps) {
  const t = useTranslations("sponsorPartnerships.fields");
  const codes = useAnswerLabels();
  const locale = useLocale();
  const { control, setValue } = useFormContext<MarketValues>();
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
  const id = (field: MarketField) => `${idPrefix}-${field}`;
  const set = (name: "market_countries" | "market_cities", next: string[]) =>
    setValue(name, next, { shouldDirty: true });
  const listsLocked = locked("market_countries") && locked("market_cities");

  const addCity = () => {
    const name = city.trim();
    if (name === "" || name.length > CITY_MAX || cities.includes(name)) return;
    set("market_cities", [...cities, name]);
    setCity("");
  };

  return (
    <>
      <ChoiceField
        id={id("interests")}
        legend={t("interests")}
        hint={t("interestsHint")}
        error={error("interests")}
        required={interestsRequired}
      >
        <Controller
          control={control}
          name="interests"
          render={({ field }) => (
            <ChoicePills
              name={id("interests")}
              type="checkbox"
              value={field.value}
              onChange={field.onChange}
              disabled={locked("interests")}
              options={policy.interests.map((code) => ({
                value: code,
                label: codes.interest(code),
              }))}
            />
          )}
        />
      </ChoiceField>

      <ChoiceField
        id={id("market_scope")}
        legend={t("scope")}
        error={error("market_scope")}
        required={interestsRequired}
      >
        <Controller
          control={control}
          name="market_scope"
          render={({ field }) => (
            <ChoicePills
              name={id("market_scope")}
              type="radio"
              value={field.value}
              disabled={locked("market_scope")}
              onChange={(next) => {
                field.onChange(next);
                // The API refuses countries or cities with a global scope.
                if (next === "global") {
                  if (countries.length > 0) set("market_countries", []);
                  if (cities.length > 0) set("market_cities", []);
                }
              }}
              options={policy.scopes.map((code) => ({ value: code, label: codes.scope(code) }))}
            />
          )}
        />
      </ChoiceField>

      {scope !== "" && scope !== "global" ? (
        <>
          <ChoiceField
            id={id("market_countries")}
            legend={t("countries")}
            error={error("market_countries")}
          >
            <RemovableChips
              items={countries.map((code) => ({ value: code, label: codes.country(code) }))}
              removeLabel={(label) => t("remove", { label })}
              disabled={listsLocked}
              onRemove={(code) =>
                set(
                  "market_countries",
                  countries.filter((item) => item !== code),
                )
              }
            />
            <div className="max-w-90">
              <Combobox
                id={`${id("market_countries")}-add`}
                aria-label={t("addCountry")}
                value={null}
                onValueChange={(code) => set("market_countries", [...countries, code])}
                options={options}
                placeholder={t("addCountry")}
                searchLabel={t("countrySearch")}
                emptyLabel={t("countryEmpty")}
                disabled={listsLocked}
                invalid={error("market_countries") !== undefined}
              />
            </div>
          </ChoiceField>
          <ChoiceField
            id={id("market_cities")}
            legend={scope === "cities" ? t("cities") : t("citiesOptional")}
            error={error("market_cities")}
          >
            <RemovableChips
              items={cities.map((name) => ({ value: name, label: name }))}
              removeLabel={(label) => t("remove", { label })}
              disabled={listsLocked}
              onRemove={(name) =>
                set(
                  "market_cities",
                  cities.filter((item) => item !== name),
                )
              }
            />
            <div className="flex max-w-120 gap-2">
              <Input
                id={`${id("market_cities")}-input`}
                fieldSize="lg"
                value={city}
                maxLength={CITY_MAX}
                disabled={listsLocked}
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
                disabled={listsLocked || city.trim() === ""}
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
