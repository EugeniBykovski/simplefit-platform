import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import { staffProblem } from "./staff-problem";

describe("staffProblem: the delivery gate (SF-133)", () => {
  it("names the closed gate, so the dialog says nothing was created or sent", () => {
    const error = new ApiError(
      409,
      "conflict",
      "conflict",
      { staff_invitation: "recipient_flow_unavailable" },
      null,
    );
    expect(staffProblem(error)).toEqual({ kind: "invitationsUnavailable" });
  });
});
