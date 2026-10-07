import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { Spinner } from "./spinner";

describe("Button", () => {
  it("defaults to the primary variant and medium size", () => {
    render(<Button>Start</Button>);
    const button = screen.getByRole("button", { name: "Start" });
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button).toHaveAttribute("data-size", "md");
    expect(button).toHaveClass("bg-primary", "text-primary-foreground", "h-10");
  });

  it.each([
    ["secondary", ["bg-secondary", "text-secondary-foreground"]],
    ["quiet", ["bg-surface-elevated", "border-input", "text-foreground"]],
    ["outline", ["border-primary-muted", "text-highlight"]],
    ["ghost", ["bg-transparent", "text-muted-foreground"]],
    ["destructive", ["bg-destructive", "text-destructive-foreground"]],
    [
      "destructive-subtle",
      ["bg-destructive-subtle", "border-destructive-border", "text-destructive-subtle-foreground"],
    ],
    ["warning", ["bg-warning", "text-warning-foreground"]],
  ] as const)("renders the %s variant with semantic tokens", (variant, tokens) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole("button", { name: "Action" })).toHaveClass(...tokens);
  });

  // Canonical web control sizes (docs/design-tokens.json controls.button.web).
  it.each([
    ["sm", ["h-8", "rounded-md", "type-body-sm"]],
    ["md", ["h-10", "rounded-md", "type-body-sm"]],
    ["lg", ["h-12", "rounded-md", "type-body-sm"]],
    ["xl", ["h-13.5", "rounded-xl", "type-body-lg"]],
    ["system", ["h-11", "rounded-md", "type-body-sm"]],
  ] as const)(
    "renders the %s size with the canonical height, radius and text role",
    (size, classes) => {
      render(<Button size={size}>Sized</Button>);
      expect(screen.getByRole("button", { name: "Sized" })).toHaveClass(
        ...classes,
        "font-extrabold",
      );
    },
  );

  it("shows a visible focus ring for keyboard users", () => {
    render(<Button>Focus</Button>);
    expect(screen.getByRole("button")).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    );
  });

  it("loading disables the button, reports busy and shows a spinner", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled buttons ignore clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a link with button styling via asChild", () => {
    render(
      <Button asChild variant="secondary">
        <a href="#details">Open</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveClass("bg-secondary");
  });
});

describe("Badge", () => {
  it.each([
    ["neutral", "bg-muted"],
    ["success", "bg-success-subtle"],
    ["warning", "bg-warning-subtle"],
    ["destructive", "bg-destructive-subtle"],
    ["info", "bg-info-subtle"],
    ["accent", "bg-accent"],
  ] as const)("renders the %s status pill", (variant, token) => {
    render(<Badge variant={variant}>Paid</Badge>);
    // type-badge is the canonical pill text (10 px Manrope 800, uppercase).
    expect(screen.getByText("Paid")).toHaveClass(token, "type-badge", "rounded-sm");
  });
});

describe("Spinner", () => {
  it("is announced when labelled", () => {
    render(<Spinner label="Loading sessions" />);
    expect(screen.getByRole("status", { name: "Loading sessions" })).toBeInTheDocument();
  });

  it("is hidden from assistive technology without a label", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
