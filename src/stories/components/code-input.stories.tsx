import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";

import { CodeInput, type CodeInputState } from "@/shared/ui/code-input";

/*
 * Claude Design component "AuthCodeInput" (shared by O03, WA4, O01c, WA1b):
 * six 66 × 78 px cells, radius xl, type-code-digit, over one real
 * `one-time-code` input.
 */
function Controlled({
  initial = "",
  state,
  onComplete,
}: {
  initial?: string;
  state?: CodeInputState;
  onComplete?: (code: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CodeInput
      label="6-digit code"
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      state={state}
    />
  );
}

const meta = {
  title: "Components/Code input",
  component: Controlled,
  args: { onComplete: fn() },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Typing: Story = {
  args: { initial: "4071" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("6-digit code"));
  },
};

export const Filled: Story = { args: { initial: "407193", state: "filled" } };
export const Invalid: Story = { args: { initial: "407100", state: "error" } };
export const Expired: Story = { args: { initial: "407193", state: "expired" } };
export const Submitting: Story = { args: { initial: "407193", state: "submitting" } };
export const Success: Story = { args: { initial: "407193", state: "success" } };
export const Locked: Story = { args: { state: "locked" } };

/** Pasting a code (with spaces, as emails show it) fills every cell and completes once. */
export const PasteCompletes: Story = {
  play: async ({ canvas, args }) => {
    const input = canvas.getByLabelText("6-digit code");
    await userEvent.click(input);
    await userEvent.paste("482 910");
    await expect(input).toHaveValue("482910");
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    await expect(args.onComplete).toHaveBeenCalledWith("482910");
  },
};
