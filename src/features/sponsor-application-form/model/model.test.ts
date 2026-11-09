import { describe, expect, it } from "vitest";

import type { SponsorApplication } from "@/entities/sponsor-application";
import { SessionChangedError } from "@/entities/session";
import { ApiError } from "@/shared/api/http/api-error";

import { outcomeOf } from "./outcome";
import { changeableFields, fieldsOf, isEditable, resumeStep, stepOfField, STEPS } from "./steps";
import { EMPTY_VALUES, formatIssues, hasAnswer, patchFor, valuesFrom } from "./values";

const answers = {
  company_name: "Acme",
  website: null,
  country_code: "PL",
  industry: "nutrition",
  contact_full_name: null,
  contact_position: null,
  contact_email: null,
  contact_phone: null,
  interests: ["content"],
  market_scope: "countries",
  market_countries: ["PL"],
  market_cities: [],
  budget_band: null,
  goals: null,
} as const;

function application(overrides: Partial<SponsorApplication> = {}): SponsorApplication {
  return {
    application_id: "11111111-1111-4111-8111-111111111111",
    status: "draft",
    revision: 3,
    answers: {
      ...answers,
      interests: [...answers.interests],
      market_countries: ["PL"],
      market_cities: [],
    },
    contact_email_verified: false,
    missing_fields: [
      "contact_full_name",
      "contact_position",
      "contact_email",
      "budget_band",
      "goals",
    ],
    allowed_actions: ["edit"],
    submit_blockers: ["incomplete"],
    submitted_at: null,
    submissions: [],
    declaration: {
      available: true,
      document_id: "sponsor-application-declaration",
      version: "v1",
      languages: ["en"],
    },
    uploads: {
      available: false,
      reason: "file_scanning_unavailable",
      content_types: [],
      max_bytes: 0,
      max_documents: 0,
      kinds: [],
      scanned: false,
    },
    evidence: [],
    change_request: null,
    sponsor_id: null,
    created_at: "2026-11-09T10:00:00Z",
    updated_at: "2026-11-09T10:00:00Z",
    ...overrides,
  } as SponsorApplication;
}

const api = (
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  retry: number | null = null,
) => new ApiError(status, code, "message", details, null, retry);

describe("steps", () => {
  it("keeps the designed order of eight steps", () => {
    expect(STEPS).toEqual([
      "company",
      "contact",
      "interests",
      "markets",
      "budget",
      "goals",
      "uploads",
      "review",
    ]);
  });

  it("prefers the policy's fields for a step and maps answers back to their step", () => {
    const policy = { steps: [{ step: "company", fields: ["company_name"] }] };
    expect(fieldsOf("company", policy)).toEqual(["company_name"]);
    expect(fieldsOf("contact")).toContain("contact_email");
    expect(fieldsOf("review")).toEqual([]);
    expect(stepOfField("market_cities")).toBe("markets");
    expect(stepOfField("declaration_language")).toBe("review");
  });

  it("resumes at the first step the backend reports missing, or review", () => {
    expect(resumeStep(application())).toBe("contact");
    expect(resumeStep(application({ missing_fields: [] }))).toBe("review");
  });

  it("after a change request resumes at the requested answer and allows only it", () => {
    const requested = application({
      status: "changes_requested",
      missing_fields: [],
      change_request: {
        fields: ["goals"],
        message: "Which events?",
        reason_code: "unclear_answers",
        requested_at: "2026-11-09T12:00:00Z",
      },
    });
    expect(resumeStep(requested)).toBe("goals");
    expect(changeableFields(requested)).toEqual(new Set(["goals"]));
    expect(changeableFields(application())).toBeNull();
  });

  it("is editable only while the backend allows edit", () => {
    expect(isEditable(null)).toBe(true);
    expect(isEditable(application())).toBe(true);
    expect(isEditable(application({ status: "submitted", allowed_actions: [] }))).toBe(false);
  });
});

describe("values", () => {
  it("round-trips the backend's answers and sends exactly the given fields", () => {
    const values = valuesFrom(application().answers);
    expect(values.company_name).toBe("Acme");
    expect(values.website).toBe("");
    expect(
      patchFor({ ...values, website: "  ", company_name: " Acme Ltd " }, [
        "company_name",
        "website",
      ]),
    ).toEqual({
      company_name: "Acme Ltd",
      website: null,
    });
    expect(patchFor(values, ["market_countries", "industry"])).toEqual({
      market_countries: ["PL"],
      industry: "nutrition",
    });
  });

  it("needs a non-blank answer before a first save", () => {
    expect(hasAnswer(patchFor(EMPTY_VALUES, ["company_name", "interests"]))).toBe(false);
    expect(hasAnswer({ company_name: "A" })).toBe(true);
  });

  it("checks the contract's formats, never requiredness", () => {
    const values = {
      ...EMPTY_VALUES,
      website: "http://acme.example",
      contact_email: "not-an-email",
      contact_phone: "+48 22",
      goals: "x".repeat(2001),
    };
    expect(
      formatIssues(values, ["company_name", "website", "contact_email", "contact_phone", "goals"]),
    ).toEqual({
      website: "invalidWebsite",
      contact_email: "invalidEmail",
      contact_phone: "invalidPhone",
      goals: "tooLong",
    });
    expect(formatIssues(EMPTY_VALUES, ["company_name", "contact_email", "website"])).toEqual({});
  });
});

describe("outcomes", () => {
  it("maps the backend's statuses and codes", () => {
    expect(outcomeOf(api(409, "revision_conflict", { current_revision: 4 }))).toEqual({
      kind: "stale",
    });
    expect(outcomeOf(api(409, "conflict", { account_registration: "incomplete" }))).toEqual({
      kind: "account",
    });
    expect(outcomeOf(api(409, "conflict", { application: "not_submittable" }))).toEqual({
      kind: "moved",
    });
    expect(outcomeOf(api(409, "conflict", { declaration: "stale" }))).toEqual({
      kind: "declaration",
    });
    expect(outcomeOf(api(409, "conflict", { client_request_id: "reused" }))).toEqual({
      kind: "reused",
    });
    expect(outcomeOf(api(409, "conflict", { evidence: "limit_reached" }))).toEqual({
      kind: "evidenceLimit",
    });
    expect(outcomeOf(api(409, "conflict", { upload: "expired" }))).toEqual({
      kind: "upload",
      reason: "expired",
    });
    expect(outcomeOf(api(404, "not_found"))).toEqual({ kind: "gone" });
    expect(outcomeOf(api(401, "unauthorized"))).toEqual({ kind: "session" });
    expect(outcomeOf(api(429, "rate_limited", {}, 30))).toEqual({
      kind: "rateLimited",
      retryAfter: 30,
    });
    expect(outcomeOf(api(503, "service_unavailable"))).toEqual({ kind: "unavailable" });
    expect(outcomeOf(api(500, "internal_error"))).toEqual({ kind: "unconfirmed" });
    expect(outcomeOf(new TypeError("Failed to fetch"))).toEqual({ kind: "unconfirmed" });
    expect(outcomeOf(new SessionChangedError())).toEqual({ kind: "session" });
  });

  it("keeps the reason codes of a validation error, including not_requested", () => {
    const error = api(422, "validation_error", {
      fields: {},
      field_codes: {
        company_name: ["not_requested"],
        goals: ["required"],
        website: ["invalid_format"],
        x: ["new_code"],
      },
    });
    expect(outcomeOf(error)).toEqual({
      kind: "invalid",
      fields: {
        company_name: "notRequested",
        goals: "required",
        website: "invalidFormat",
        x: "invalid",
      },
    });
  });
});
