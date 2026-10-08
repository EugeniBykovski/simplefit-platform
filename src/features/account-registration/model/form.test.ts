import { describe, expect, it } from "vitest";

import type { AccountProfile } from "@/entities/account-profile";
import { ApiError } from "@/shared/api/http/api-error";

import {
  clientErrors,
  isAtLeast16,
  isCalendarDate,
  patchFrom,
  rejectionOf,
  todayIso,
  valuesFrom,
  type AccountValues,
} from "./form";

const consent = (accepted: string | null, current: string) => ({
  accepted: accepted !== null,
  accepted_version: accepted,
  accepted_at: accepted === null ? null : "2026-10-01T10:00:00Z",
  current_version: current,
  current: accepted === current,
});

function profile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    registration: {
      status: "in_progress",
      completed_at: null,
      missing_requirements: ["date_of_birth", "terms", "privacy"],
    },
    full_name: "Alex Kowalski",
    date_of_birth: null,
    consents: { terms: consent(null, "terms-v1"), privacy: consent(null, "privacy-v1") },
    product_news: { subscribed: false, updated_at: null },
    ...overrides,
  } as AccountProfile;
}

const VALID: AccountValues = {
  full_name: "Alex Kowalski",
  date_of_birth: "2000-05-17",
  accept_terms: true,
  accept_privacy: true,
  product_news: false,
};

const validation = (field_codes: Record<string, string[]>) =>
  new ApiError(422, "validation_error", "Validation failed", { fields: {}, field_codes }, null);

describe("valuesFrom", () => {
  it("checks a required consent only when the version in force is accepted", () => {
    const values = valuesFrom(
      profile({
        consents: {
          terms: consent("terms-v1", "terms-v1"),
          privacy: consent("privacy-v1", "privacy-v2"),
        },
      }),
    );
    expect(values.accept_terms).toBe(true);
    // Accepted an older Privacy Policy: the visitor accepts the new one.
    expect(values.accept_privacy).toBe(false);
  });

  it("shows the recorded product news choice and empty strings for missing values", () => {
    expect(
      valuesFrom(
        profile({
          full_name: null,
          product_news: { subscribed: true, updated_at: "2026-10-01T10:00:00Z" },
        }),
      ),
    ).toMatchObject({ full_name: "", date_of_birth: "", product_news: true });
  });
});

describe("dates", () => {
  it("today is the visitor's own calendar date, never the UTC one", () => {
    expect(todayIso(new Date(2026, 9, 8, 23, 59))).toBe("2026-10-08");
    expect(todayIso(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("accepts only real calendar dates", () => {
    expect(isCalendarDate("2000-05-17")).toBe(true);
    expect(isCalendarDate("2004-02-29")).toBe(true);
    expect(isCalendarDate("2005-02-29")).toBe(false);
    expect(isCalendarDate("2000-13-01")).toBe(false);
    expect(isCalendarDate("17/05/2000")).toBe(false);
    expect(isCalendarDate("2000-05-17T00:00:00Z")).toBe(false);
  });

  it("16 or older by calendar date: the 16th birthday itself counts", () => {
    expect(isAtLeast16("2010-10-08", "2026-10-08")).toBe(true);
    expect(isAtLeast16("2010-10-09", "2026-10-08")).toBe(false);
    // Born on 29 February: 16 on 1 March in a common year.
    expect(isAtLeast16("2008-02-29", "2024-02-28")).toBe(false);
    expect(isAtLeast16("2008-02-29", "2024-02-29")).toBe(true);
    expect(isAtLeast16("2012-02-29", "2028-02-29")).toBe(true);
    expect(isAtLeast16("2012-02-29", "2028-02-28")).toBe(false);
  });
});

describe("clientErrors", () => {
  const today = "2026-10-08";

  it("passes a complete form", () => {
    expect(clientErrors(VALID, today)).toEqual({});
  });

  it("reports every missing requirement at once", () => {
    expect(
      clientErrors(
        {
          ...VALID,
          full_name: "  ",
          date_of_birth: "",
          accept_terms: false,
          accept_privacy: false,
        },
        today,
      ),
    ).toEqual({
      full_name: "fullNameRequired",
      date_of_birth: "dateOfBirthRequired",
      accept_terms: "terms",
      accept_privacy: "privacy",
    });
  });

  it("rejects a too-long name, a future or impossible date and an under-16 date", () => {
    expect(clientErrors({ ...VALID, full_name: "a".repeat(201) }, today).full_name).toBe("tooLong");
    expect(clientErrors({ ...VALID, date_of_birth: "2026-10-09" }, today).date_of_birth).toBe(
      "invalidDate",
    );
    expect(clientErrors({ ...VALID, date_of_birth: "2001-02-29" }, today).date_of_birth).toBe(
      "invalidDate",
    );
    expect(clientErrors({ ...VALID, date_of_birth: "2012-03-12" }, today).date_of_birth).toBe(
      "tooYoung",
    );
  });

  it("product news is never required", () => {
    expect(clientErrors({ ...VALID, product_news: false }, today)).toEqual({});
  });
});

describe("patchFrom", () => {
  it("sends only the fields this form changed", () => {
    expect(patchFrom(VALID, { date_of_birth: true }, {})).toEqual({ date_of_birth: "2000-05-17" });
    expect(patchFrom(VALID, {}, {})).toEqual({});
  });

  it("leaves out a changed field that failed its check, keeping the valid ones", () => {
    expect(
      patchFrom(
        { ...VALID, date_of_birth: "2012-03-12" },
        { full_name: true, date_of_birth: true },
        { date_of_birth: "tooYoung" },
      ),
    ).toEqual({ full_name: "Alex Kowalski" });
  });

  it("sends a required consent only as the visitor's explicit true", () => {
    expect(patchFrom(VALID, { accept_terms: true, accept_privacy: true }, {})).toEqual({
      accept_terms: true,
      accept_privacy: true,
    });
    // Unticked again before Continue: nothing is sent (there is no withdrawal).
    expect(
      patchFrom(
        { ...VALID, accept_terms: false },
        { accept_terms: true },
        { accept_terms: "terms" },
      ),
    ).toEqual({});
  });

  it("sends product news both ways when toggled, never otherwise", () => {
    expect(patchFrom({ ...VALID, product_news: true }, { product_news: true }, {})).toEqual({
      product_news: true,
    });
    expect(patchFrom({ ...VALID, product_news: false }, { product_news: true }, {})).toEqual({
      product_news: false,
    });
  });

  it("trims the name; never clears a date of birth", () => {
    expect(patchFrom({ ...VALID, full_name: "  Alex  " }, { full_name: true }, {})).toEqual({
      full_name: "Alex",
    });
    expect(patchFrom({ ...VALID, date_of_birth: "" }, { date_of_birth: true }, {})).toEqual({});
  });
});

describe("rejectionOf", () => {
  it("maps PATCH field codes to the controls' messages", () => {
    expect(
      rejectionOf(
        validation({
          full_name: ["too_long"],
          date_of_birth: ["too_young"],
          accept_terms: ["must_be_accepted"],
        }),
      ),
    ).toEqual({ full_name: "tooLong", date_of_birth: "tooYoung", accept_terms: "terms" });
    expect(rejectionOf(validation({ date_of_birth: ["immutable"] }))).toEqual({
      date_of_birth: "immutable",
    });
    // A future date is the API's `out_of_range`; an impossible one `invalid_format`.
    expect(rejectionOf(validation({ date_of_birth: ["out_of_range"] }))).toEqual({
      date_of_birth: "invalidDate",
    });
    expect(rejectionOf(validation({ date_of_birth: ["invalid_format"] }))).toEqual({
      date_of_birth: "invalidDate",
    });
  });

  it("maps completion's missing requirements, consents included", () => {
    expect(
      rejectionOf(
        validation({
          full_name: ["required"],
          date_of_birth: ["required"],
          terms: ["required"],
          privacy: ["required"],
        }),
      ),
    ).toEqual({
      full_name: "fullNameRequired",
      date_of_birth: "dateOfBirthRequired",
      accept_terms: "terms",
      accept_privacy: "privacy",
    });
  });

  it("is not a rejection for any other failure", () => {
    expect(rejectionOf(new ApiError(503, "service_unavailable", "", {}, null))).toBeUndefined();
    expect(rejectionOf(new TypeError("Failed to fetch"))).toBeUndefined();
  });
});
