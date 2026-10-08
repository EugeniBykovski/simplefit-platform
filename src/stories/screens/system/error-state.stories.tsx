import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Container } from "@/shared/ui/container";
import { ErrorState } from "@/widgets/system-states";

/*
 * The production failure states (SF-34), as the error boundaries render
 * them. Design source: the Claude Design "System states" sheet (ERROR,
 * OFFLINE, PERMISSION DENIED); "unavailable" has no artboard and is the
 * design-system fallback.
 */
const meta = {
  title: "System/Errors/Error State",
  component: ErrorState,
  args: { kind: "unexpected", onRetry: () => {} },
  decorators: [
    (Story) => (
      <Container className="flex min-h-dvh items-center justify-center bg-background py-14">
        <Story />
      </Container>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unexpected: Story = {};
export const Offline: Story = { args: { kind: "offline" } };
export const Forbidden: Story = { args: { kind: "forbidden" } };
export const Unavailable: Story = { args: { kind: "unavailable" } };
