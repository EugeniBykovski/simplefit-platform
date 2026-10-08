/**
 * Countries for a country selector, as ISO 3166-1 alpha-2 codes with names in
 * the reader's language (SF-38). The codes come from the runtime's Unicode
 * CLDR region data (`Intl.DisplayNames`), not from a copied list: every
 * two-letter code the engine names, minus every code ISO 3166-1 does not
 * officially assign. The result is the officially assigned set the API accepts
 * (`country_code`, `invalid_choice` otherwise); `countries.test.ts` checks
 * the shape and the exclusions.
 */

/**
 * The ISO 3166-1 alpha-2 codes that are not officially assigned countries, by
 * class, so the result does not depend on which extra codes an engine's region
 * data happens to name (Firefox names withdrawn codes that Chromium and
 * WebKit do not):
 *
 * - user-assigned: AA, QM–QZ, XA–XZ, ZZ (`isUserAssigned`);
 * - exceptionally reserved: AC CP CQ DG EA EU EZ FX IC SU TA UK UN;
 * - transitionally reserved: BU CS NT TP YU ZR;
 * - withdrawn (ISO 3166-3) and not reassigned: AN CT DD DY FQ HV JT MI NH NQ
 *   PC PU PZ RH VD WK YD.
 */
const NOT_ASSIGNED: ReadonlySet<string> = new Set(
  (
    "AC CP CQ DG EA EU EZ FX IC SU TA UK UN " +
    "BU CS NT TP YU ZR " +
    "AN CT DD DY FQ HV JT MI NH NQ PC PU PZ RH VD WK YD"
  ).split(" "),
);

/** The user-assigned code ranges of ISO 3166-1: never a country. */
const isUserAssigned = (code: string) =>
  code === "AA" ||
  code === "ZZ" ||
  code.startsWith("X") ||
  (code.charAt(0) === "Q" && code.charAt(1) >= "M");

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

let assigned: readonly string[] | undefined;

/** The officially assigned ISO 3166-1 alpha-2 codes CLDR names, uppercase. */
export function countryCodes(): readonly string[] {
  if (assigned !== undefined) return assigned;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  assigned = LETTERS.flatMap((first) => LETTERS.map((second) => `${first}${second}`)).filter(
    (code) => !NOT_ASSIGNED.has(code) && !isUserAssigned(code) && names.of(code) !== undefined,
  );
  return assigned;
}

export type CountryOption = { code: string; name: string };

/** The countries named in `locale`, sorted for that locale. */
export function countryOptions(locale: string): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" });
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return countryCodes()
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** A country's name in `locale` (its code when the runtime has no name). */
export function countryName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(code) ?? code;
}
