import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRightIcon, PlusIcon, TimerIcon } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Button } from "./button";

const variants = [
  "primary",
  "secondary",
  "quiet",
  "outline",
  "ghost",
  "destructive",
  "destructive-subtle",
  "warning",
  "link",
] as const;
const sizes = ["sm", "md", "lg", "xl", "system"] as const;

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Start round", onClick: fn() },
  argTypes: {
    variant: { control: "select", options: variants },
    size: { control: "select", options: [...sizes, "icon", "icon-sm"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {variants.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** Canonical web heights: sm 32, md 40, lg 48 (radius md), xl 54 (radius xl). */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {sizes.map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>
        <PlusIcon aria-hidden /> Add session
      </Button>
      <Button {...args} size="xl">
        Start round <ArrowRightIcon aria-hidden />
      </Button>
      <Button {...args} size="icon" variant="quiet" aria-label="Round timer">
        <TimerIcon aria-hidden />
      </Button>
      <Button {...args} size="icon-sm" variant="ghost" aria-label="Add">
        <PlusIcon aria-hidden />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button")).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { loading: true, children: "Saving" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Saving" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  },
};

/** Keyboard focus shows the olive `ring` (focus-visible). */
export const KeyboardFocus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button")).toHaveFocus();
  },
};

export const AsLink: Story = {
  render: (args) => (
    <Button {...args} asChild variant="quiet">
      <a href="#details">Open details</a>
    </Button>
  ),
};
