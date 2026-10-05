import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Skeleton } from "./skeleton";

/** Card: surface, hairline border, radius 3xl, 18 × 20. Compact (`size="sm"`): 2xl, 14 × 16. */
const meta = {
  title: "Components/Card",
  component: Card,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Next session</CardTitle>
        <CardDescription>Technical · Warsaw BC</CardDescription>
        <CardAction>
          <Badge variant="success">Booked</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="type-metric-xl">18:00</p>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="type-caption text-muted-foreground">Arrive 17:50 · Ring 2</span>
        <Button size="sm">Check in</Button>
      </CardFooter>
    </Card>
  ),
};

export const Compact: Story = {
  render: () => (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Rounds this week</CardTitle>
        <CardDescription>Bento tile · one metric</CardDescription>
      </CardHeader>
      <CardContent className="flex items-baseline gap-2">
        <span className="type-metric-lg">52</span>
        <span className="type-label text-faint-foreground">Rounds</span>
      </CardContent>
    </Card>
  ),
};

export const Loading: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Loading</CardTitle>
        <CardDescription>Skeletons keep the card geometry.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  ),
};
