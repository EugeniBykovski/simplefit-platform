/**
 * Countries for a country selector, as ISO 3166-1 alpha-2 codes with names in
 * the reader's language (SF-38). The codes come from the runtime's Unicode
 * CLDR region data (`Intl.DisplayNames`), not from a copied list: every
 * two-letter code CLDR names, minus the codes ISO 3166-1 does not officially
 * assign. The result is the officially assigned set the API accepts
 * (`country_code`, `invalid_choice` otherwise); `countries.test.ts` checks
 * the shape and the exclusions.
 */

/**
 * CLDR region codes that are not officially assigned ISO 3166-1 alpha-2
 * codes: exceptionally or transitionally reserved (AC, CP, CQ, DG, EA, EU, EZ,
 * FX, IC, TA, UK, UN), withdrawn (AN, BU, CS, DD, DY, HV, NH, RH, SU, TP, VD,
 * YD, YU, ZR), user-assigned (QO, XA, XB, XK) and unknown (ZZ).
 */
const NOT_ASSIGNED: ReadonlySet<string> = new Set(
  (
    "AC CP CQ DG EA EU EZ FX IC TA UK UN " +
    "AN BU CS DD DY HV NH RH SU TP VD YD YU ZR " +
    "QO XA XB XK ZZ"
  ).split(" "),
);

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

let assigned: readonly string[] | undefined;

/** The officially assigned ISO 3166-1 alpha-2 codes CLDR names, uppercase. */
export function countryCodes(): readonly string[] {
  if (assigned !== undefined) return assigned;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  assigned = LETTERS.flatMap((first) => LETTERS.map((second) => `${first}${second}`)).filter(
    (code) => !NOT_ASSIGNED.has(code) && names.of(code) !== undefined,
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
