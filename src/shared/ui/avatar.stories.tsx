import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Avatar, AvatarFallback, AvatarGroup } from "./avatar";

/** Initials on `highlight` in Unbounded 700; the accessible name is the person's name. */
const meta = {
  title: "Components/Avatar",
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="sm" role="img" aria-label="Yauheni B.">
        <AvatarFallback>YB</AvatarFallback>
      </Avatar>
      <Avatar role="img" aria-label="Mike R.">
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
      <Avatar size="lg" role="img" aria-label="Kasia W.">
        <AvatarFallback>KW</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar role="img" aria-label="Yauheni B.">
        <AvatarFallback>YB</AvatarFallback>
      </Avatar>
      <Avatar role="img" aria-label="Mike R.">
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
      <Avatar role="img" aria-label="Kasia W.">
        <AvatarFallback>KW</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  ),
};
