import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BillingCycle: Story = {
  render: () => (
    <RadioGroup defaultValue="monthly" aria-label="Billing cycle">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="monthly" id="monthly" />
        <Label htmlFor="monthly">Monthly</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="annual" id="annual" />
        <Label htmlFor="annual">Annual · 2 months free</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="lifetime" id="lifetime" disabled />
        <Label htmlFor="lifetime">Lifetime (unavailable)</Label>
      </div>
    </RadioGroup>
  ),
};
