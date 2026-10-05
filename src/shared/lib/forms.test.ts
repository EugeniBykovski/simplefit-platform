import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import { applyApiFieldErrors } from "./forms";

type Values = { email: string; date_of_birth: string };

function setup() {
  return renderHook(() => {
    const form = useForm<Values>({ defaultValues: { email: "", date_of_birth: "" } });
    // formState is a subscription proxy: read errors during render to track them.
    void form.formState.errors;
    return form;
  });
}

const validationError = (fields: Record<string, string[]>) =>
  new ApiError(422, "validation_error", "Request validation failed", { fields }, "req-1");

describe("applyApiFieldErrors", () => {
  it("sets backend messages on matching fields and collects the rest on root.server", () => {
    const { result } = setup();

    let handled = false;
    act(() => {
      handled = applyApiFieldErrors(
        validationError({ email: ["has invalid format", "is taken"], nickname: ["too long"] }),
        result.current.setError,
        ["email", "date_of_birth"],
      );
    });

    expect(handled).toBe(true);
    expect(result.current.formState.errors.email?.message).toBe("has invalid format is taken");
    expect(result.current.formState.errors.root?.server?.message).toBe("nickname: too long");
  });

  it("ignores errors that are not backend validation errors", () => {
    const { result } = setup();

    const handled = applyApiFieldErrors(
      new ApiError(409, "conflict", "Conflict", {}, null),
      result.current.setError,
      ["email"],
    );

    expect(handled).toBe(false);
    expect(result.current.formState.errors).toEqual({});
  });
});
