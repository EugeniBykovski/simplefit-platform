import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";

import { Button } from "./button";
import { Toaster } from "./sonner";

/** Sonner toasts on surface-elevated (the Toaster is mounted once, in the preview). */
const meta = {
  title: "Components/Toast",
  component: Toaster,
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Kinds: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="quiet" onClick={() => toast("Session saved")}>
        Neutral
      </Button>
      <Button variant="quiet" onClick={() => toast.success("Round logged")}>
        Success
      </Button>
      <Button variant="quiet" onClick={() => toast.warning("Trial ends tomorrow")}>
        Warning
      </Button>
      <Button
        variant="quiet"
        onClick={() => toast.error("Payment failed", { description: "Update your card." })}
      >
        Error
      </Button>
    </div>
  ),
};
