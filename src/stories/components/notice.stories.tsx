import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ClockIcon, MailIcon, ShieldIcon, TriangleAlertIcon } from "lucide-react";

import { Notice } from "@/shared/ui/notice";

/* Inline status box of the auth screens (O01c, O03, WA1b, WA4, WA4b). */
const meta = {
  title: "Components/Notice",
  component: Notice,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  args: { icon: MailIcon, tone: "olive", children: "Code sent. It expires in 10 minutes." },
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Olive: Story = {};
export const Amber: Story = {
  args: { tone: "amber", icon: ClockIcon, children: "This code has expired. Send a new one." },
};
export const Coral: Story = {
  args: {
    tone: "coral",
    icon: TriangleAlertIcon,
    children: "That code isn’t right. Check the digits and try again.",
  },
};
export const Muted: Story = {
  args: {
    tone: "muted",
    icon: ShieldIcon,
    children: "Never share this code. SimpleFit staff will never ask you for it.",
  },
};

/** Fighter registration (WF0 / WF1): the status dot instead of an icon, with an action at the right. */
export const DotWithAction: Story = {
  args: {
    tone: "amber",
    icon: undefined,
    children: (
      <span className="flex flex-col gap-0.5">
        <b>We couldn’t save your changes.</b>
        <span>Check your connection. Nothing you typed is lost.</span>
      </span>
    ),
    action: (
      <button type="button" className="type-caption font-extrabold underline">
        Retry
      </button>
    ),
  },
};

export const DotCoral: Story = {
  args: {
    tone: "coral",
    icon: undefined,
    children: (
      <span className="flex flex-col gap-0.5">
        <b>Check the highlighted fields.</b>
        <span>Fix them to save this step.</span>
      </span>
    ),
  },
};
