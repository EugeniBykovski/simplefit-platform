import { describe, expect, it } from "vitest";

import { continuationOf, continuationQuery, parseIntent, withContinuation } from "./continuation";

describe("parseIntent", () => {
  it("accepts exactly the backend's allow-list", () => {
    for (const intent of ["fighter", "coach", "gym", "sponsor"])
      expect(parseIntent(intent)).toBe(intent);
  });

  it.each([
    "Fighter",
    "FIGHTER",
    " fighter",
    "fighter ",
    "admin",
    "gym_workspace",
    "",
    "role",
    null,
    1,
    ["fighter"],
  ])("rejects %j", (value) => {
    expect(parseIntent(value)).toBeUndefined();
  });
});

describe("continuationOf", () => {
  it("reads returnTo and intent from a search string, URLSearchParams or a searchParams record", () => {
    const expected = { returnTo: "/app/settings/security", intent: "fighter" };
    expect(continuationOf("?returnTo=%2Fapp%2Fsettings%2Fsecurity&intent=fighter")).toEqual(
      expected,
    );
    expect(
      continuationOf(
        new URLSearchParams({ returnTo: "/app/settings/security", intent: "fighter" }),
      ),
    ).toEqual(expected);
    expect(continuationOf({ returnTo: "/app/settings/security", intent: "fighter" })).toEqual(
      expected,
    );
  });

  it("drops anything not allowed and never guesses between repeated values", () => {
    expect(continuationOf("?returnTo=https%3A%2F%2Fevil.example&intent=admin")).toEqual({});
    expect(continuationOf("?intent=fighter&intent=coach")).toEqual({});
    expect(continuationOf(new URLSearchParams("intent=fighter&intent=coach"))).toEqual({});
    expect(continuationOf({ intent: ["fighter", "coach"] })).toEqual({});
    expect(continuationOf({ returnTo: "/app/onboarding/role" })).toEqual({});
    expect(continuationOf("")).toEqual({});
  });
});

describe("continuationQuery and withContinuation", () => {
  it("carry the valid continuation along an auth step", () => {
    expect(withContinuation("web.signup.account", { intent: "coach" })).toBe(
      "/signup/account?intent=coach",
    );
    expect(
      withContinuation("web.login.code", { returnTo: "/app/messages?thread=1", intent: "gym" }),
    ).toBe("/login/code?returnTo=%2Fapp%2Fmessages%3Fthread%3D1&intent=gym");
    expect(withContinuation("web.signup")).toBe("/signup");
  });

  it("re-validate what they carry", () => {
    const forged = { returnTo: "//evil.example", intent: "admin" } as unknown as Parameters<
      typeof continuationQuery
    >[0];
    expect(continuationQuery(forged)).toEqual({});
    expect(withContinuation("web.signup", forged)).toBe("/signup");
  });
});
