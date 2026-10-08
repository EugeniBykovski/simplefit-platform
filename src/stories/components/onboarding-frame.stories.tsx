import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "@/shared/ui/button";
import {
  OnboardingFrame,
  OnboardingGrid,
  OnboardingStepCard,
  onboardingActionClass,
} from "@/shared/ui/onboarding-frame";

/*
 * The onboarding frame of the signed-in setup steps (WA5 account basics, WF0 /
 * WF1 / WF6 Fighter registration): the 72 px header with a badge and an
 * action, then a form step's three columns (step card, form, aside). The
 * screens pass their own steps, copy and content.
 */
const meta = {
  title: "Components/Onboarding frame",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const column = (label: string) => (
  <div className="flex min-h-60 items-center justify-center rounded-3xl border border-dashed type-caption text-faint-foreground">
    {label}
  </div>
);

export const AccountSetup: Story = {
  render: () => (
    <OnboardingFrame
      badge="Account setup"
      badgeVariant="neutral"
      actions={
        <Button variant="ghost" className={onboardingActionClass}>
          Sign out
        </Button>
      }
    >
      <OnboardingGrid>
        <OnboardingStepCard
          label="Account setup steps"
          title="Account setup"
          note="Needed once for every role on your account."
          footnote="Step 2 is skipped when you already picked where to start."
          steps={[
            { key: "basics", label: "Account basics", state: "current" },
            { key: "start", label: "Where to start", state: "todo" },
            { key: "setup", label: "Your setup", state: "later", hint: "after account setup" },
          ]}
        />
        {column("Form")}
        <aside>{column("Aside")}</aside>
      </OnboardingGrid>
    </OnboardingFrame>
  ),
};

export const FighterSteps: Story = {
  render: () => (
    <OnboardingFrame
      badge="Fighter"
      actions={
        <Button variant="ghost" className={onboardingActionClass}>
          Save & exit
        </Button>
      }
    >
      <OnboardingGrid>
        <OnboardingStepCard
          label="Fighter registration steps"
          title="Fighter setup"
          note="Two short steps."
          steps={[
            {
              key: "basics",
              label: "Profile basics",
              state: "done",
              onSelect: () => {},
              hint: "done",
            },
            { key: "profile", label: "Boxing profile", state: "current" },
          ]}
        />
        {column("Form")}
        <aside>{column("Preview")}</aside>
      </OnboardingGrid>
    </OnboardingFrame>
  ),
};
