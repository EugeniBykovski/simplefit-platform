import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, type Mock } from "vitest";

import type { GymCreateInput, GymSetup, GymSetupPatch } from "@/entities/gym-setup";
import { ApiError } from "@/shared/api/http/api-error";
import { renderWithProviders } from "@/test/render";

import { BrandingStep } from "./branding-step";
import { LocationStep } from "./location-step";
import { TypeStep, type CreateKey } from "./type-step";

/*
 * The SF-86 guardrails of OG1–OG3: one create key per attempt (repeated by
 * Retry, renewed only once spent), nothing claimed before the API answers,
 * a stale revision never overwrites and never loses input, and completion
 * happens only through the API.
 */

const LOCATION = {
  id: "loc-1",
  name: "Warsaw",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 31",
  entrance_note: null,
  is_primary: true,
};

function setup(fields: Partial<GymSetup> = {}): GymSetup {
  return {
    gym_id: "gym-1",
    name: "Simple Boxing Gym",
    gym_type: "boxing_gym",
    phone: null,
    website: null,
    tagline: null,
    accent_color: null,
    primary_location: null,
    revision: 1,
    setup_status: "draft",
    missing_requirements: ["primary_location"],
    viewer: { role: "owner", permissions: [], staff_membership_id: "sm-1" },
    ...fields,
  } as GymSetup;
}

type CreateFn = (input: GymCreateInput) => Promise<GymSetup>;
type SaveFn = (setup: GymSetup, patch: GymSetupPatch) => Promise<GymSetup>;
type CompleteFn = (setup: GymSetup) => Promise<GymSetup>;

const conflict = (details: Record<string, unknown>) =>
  ApiError.fromResponse(409, { error: { code: "conflict", message: "x", details } }, null);
const invalid = (field_codes: Record<string, string[]>) =>
  ApiError.fromResponse(
    422,
    { error: { code: "validation_error", message: "x", details: { fields: {}, field_codes } } },
    null,
  );

function keys(): CreateKey & { issued: string[] } {
  let n = 0;
  let current: string | undefined;
  const issued: string[] = [];
  return {
    issued,
    current: () => {
      current ??= `key-${++n}`;
      issued.push(current);
      return current;
    },
    renew: () => {
      current = undefined;
    },
  };
}

async function renderType({
  initial = null,
  create = vi.fn<CreateFn>(async () => setup()),
  save = vi.fn<SaveFn>(async (current, patch) => ({ ...current, ...patch }) as GymSetup),
}: {
  initial?: GymSetup | null;
  create?: Mock<CreateFn>;
  save?: Mock<SaveFn>;
} = {}) {
  const createKey = keys();
  const onDone = vi.fn();
  await renderWithProviders(
    <TypeStep
      setup={initial}
      create={create}
      save={save}
      createKey={createKey}
      accountHref="/app/onboarding/account"
      onDone={onDone}
      onSaveExit={vi.fn()}
      registerSaver={vi.fn()}
    />,
  );
  return { create, save, createKey, onDone };
}

async function fillGym(name = "Simple Boxing Gym") {
  await userEvent.type(screen.getByRole("textbox", { name: "Gym name" }), name);
  await userEvent.click(screen.getByRole("radio", { name: "Boxing gym" }));
}

describe("TypeStep (OG1)", () => {
  it("creates the draft with the attempt's key, and moves on only after the API answered", async () => {
    const { create, save, onDone } = await renderType();
    await fillGym();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("location"));
    expect(create).toHaveBeenCalledExactlyOnceWith({
      client_request_id: "key-1",
      name: "Simple Boxing Gym",
      gym_type: "boxing_gym",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("checks the requirements before creating anything", async () => {
    const { create } = await renderType();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your gym’s name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a gym type.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("saves the optional phone and website against the new draft", async () => {
    const { save, onDone } = await renderType();
    await fillGym();
    await userEvent.type(screen.getByRole("textbox", { name: "Website · optional" }), "gym.pl");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("location"));
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revision: 1 }), {
      website: "https://gym.pl",
    });
  });

  it("an unconfirmed create claims nothing and Retry repeats the same key", async () => {
    const create = vi
      .fn<CreateFn>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(setup());
    const { createKey, onDone } = await renderType({ create });
    await fillGym();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("We couldn’t confirm your gym was created."),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Gym name" })).toHaveValue("Simple Boxing Gym");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("location"));
    expect(createKey.issued).toEqual(["key-1", "key-1"]);
  });

  it("a discarded key is reported truthfully and renewed for the next attempt", async () => {
    const create = vi
      .fn<CreateFn>()
      .mockRejectedValueOnce(conflict({ client_request_id: "discarded" }))
      .mockResolvedValueOnce(setup());
    const { createKey, onDone } = await renderType({ create });
    await fillGym();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("That gym draft was discarded.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("location"));
    expect(createKey.issued).toEqual(["key-1", "key-2"]);
  });

  it("a resumed draft opens without writing the typed values", async () => {
    const create = vi.fn<CreateFn>(async () =>
      setup({ name: "Older Draft", gym_type: "boxing_club" }),
    );
    const { save, onDone } = await renderType({ create });
    await fillGym("New Gym");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("You already have a gym in progress.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Gym name" })).toHaveValue("New Gym");
  });

  it("explains the creation limit with its retry time", async () => {
    const create = vi
      .fn<CreateFn>()
      .mockRejectedValue(
        ApiError.fromResponse(
          429,
          { error: { code: "rate_limited", message: "x", details: {} } },
          null,
          "3600",
        ),
      );
    await renderType({ create });
    await fillGym();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("You’ve started several gyms today.")).toBeInTheDocument();
    expect(screen.getByText(/Try again in 1 hour\./)).toBeInTheDocument();
  });

  it("says when the visitor already has a gym: continuing creates another", async () => {
    const createKey = keys();
    await renderWithProviders(
      <TypeStep
        setup={null}
        create={vi.fn<CreateFn>()}
        save={vi.fn<SaveFn>()}
        createKey={createKey}
        existingGyms={1}
        gymHref="/app?intent=gym"
        accountHref="/a"
        onDone={vi.fn()}
        onSaveExit={vi.fn()}
        registerSaver={vi.fn()}
      />,
    );
    expect(screen.getByText("You already have a gym in SimpleFit.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my gym" })).toHaveAttribute(
      "href",
      expect.stringContaining("intent=gym"),
    );
  });

  it("saves only what changed on an existing draft, with its revision", async () => {
    const { save, create, onDone } = await renderType({ initial: setup({ revision: 7 }) });
    const name = screen.getByRole("textbox", { name: "Gym name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed Gym");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("location"));
    expect(create).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revision: 7 }), {
      name: "Renamed Gym",
    });
  });
});

describe("LocationStep (OG2): a stale revision", () => {
  it("loads the latest version, keeps the input and saves only on an explicit reapply", async () => {
    const latest = setup({ revision: 2, primary_location: { ...LOCATION, city: "Kraków" } });
    const setLocation = vi
      .fn()
      .mockRejectedValueOnce(conflict({ revision: "stale" }))
      .mockImplementationOnce(async (current: GymSetup) => ({
        ...current,
        revision: 3,
        primary_location: LOCATION,
      }));
    const reload = vi.fn(async () => latest);
    const onDone = vi.fn();
    const props = {
      setLocation,
      reload,
      accountHref: "/a",
      onDone,
      onSaveExit: vi.fn(),
      registerSaver: vi.fn(),
    };
    const view = await renderWithProviders(<LocationStep setup={setup()} {...props} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Country" }));
    await userEvent.type(screen.getByPlaceholderText("Search"), "Poland");
    await userEvent.click(await screen.findByRole("option", { name: "Poland" }));
    await userEvent.type(screen.getByRole("textbox", { name: "City" }), "Warsaw");
    await userEvent.type(screen.getByRole("textbox", { name: "Address" }), "ul. Ząbkowska 31");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("This gym changed on another device or tab."),
    ).toBeInTheDocument();
    expect(reload).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    // The reloaded setup arrives through the cache; the visitor's edits stay.
    view.rerender(<LocationStep setup={latest} {...props} />);
    expect(screen.getByRole("textbox", { name: "City" })).toHaveValue("Warsaw");

    await userEvent.click(screen.getByRole("button", { name: "Save my changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("branding"));
    expect(setLocation).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2 }), {
      country_code: "PL",
      city: "Warsaw",
      address_line: "ul. Ząbkowska 31",
      entrance_note: null,
    });
  });
});

describe("BrandingStep (OG3)", () => {
  async function renderBranding({
    complete = vi.fn<CompleteFn>(async (current) => ({ ...current, setup_status: "completed" })),
    save = vi.fn<SaveFn>(async (current, patch) => ({ ...current, ...patch }) as GymSetup),
  }: { complete?: Mock<CompleteFn>; save?: Mock<SaveFn> } = {}) {
    const onCompleted = vi.fn();
    const onNavigate = vi.fn();
    await renderWithProviders(
      <BrandingStep
        setup={setup({ primary_location: LOCATION, missing_requirements: [] })}
        save={save}
        reload={vi.fn()}
        complete={complete}
        accountHref="/a"
        onNavigate={onNavigate}
        onCompleted={onCompleted}
        onSaveExit={vi.fn()}
        registerSaver={vi.fn()}
      />,
    );
    return { complete, save, onCompleted, onNavigate };
  }

  it("shows Logo and Cover as not available yet, never as an upload", async () => {
    await renderBranding();
    expect(
      screen.getByText("Logo upload isn’t available yet. Your initials are used."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cover photo upload isn’t available yet.")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("Create gym saves the branding, then completes through the API", async () => {
    const { save, complete, onCompleted } = await renderBranding();
    await userEvent.click(screen.getByRole("radio", { name: "Sky" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Tagline · optional" }), "Box on");
    await userEvent.click(screen.getByRole("button", { name: "Create gym" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      tagline: "Box on",
      accent_color: "#7fa7c9",
    });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("Skip completes without the branding edits", async () => {
    const { save, complete, onCompleted } = await renderBranding();
    await userEvent.type(screen.getByRole("textbox", { name: "Tagline · optional" }), "Box on");
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(save).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("missing requirements stay on OG3 with a way to their step", async () => {
    const complete = vi
      .fn<CompleteFn>()
      .mockRejectedValue(invalid({ primary_location: ["required"] }));
    const { onCompleted, onNavigate } = await renderBranding({ complete });
    await userEvent.click(screen.getByRole("button", { name: "Create gym" }));
    expect(await screen.findByText("Your gym is missing details.")).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Go to Location" }));
    expect(onNavigate).toHaveBeenCalledWith("location");
  });

  it("an unconfirmed completion claims nothing", async () => {
    const complete = vi.fn<CompleteFn>().mockRejectedValue(new TypeError("Failed to fetch"));
    const { onCompleted } = await renderBranding({ complete });
    await userEvent.click(screen.getByRole("button", { name: "Create gym" }));
    expect(
      await screen.findByText("We couldn’t confirm your gym was created."),
    ).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
