import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

/** Segmented pill track on surface; selected segment bone (`secondary`) 800. */
const meta = {
  title: "Components/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Segmented: Story = {
  render: () => (
    <Tabs defaultValue="money" className="max-w-sm">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="money">Money</TabsTrigger>
        <TabsTrigger value="social">Social</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="text-muted-foreground">
        Every notification.
      </TabsContent>
      <TabsContent value="money" className="text-muted-foreground">
        Trials, payments and payouts.
      </TabsContent>
      <TabsContent value="social" className="text-muted-foreground">
        Friends, comments and challenges.
      </TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: () => (
    <Tabs defaultValue="week" className="max-w-sm">
      <TabsList variant="line">
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="camp">Camp</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="text-muted-foreground">
        Nine sessions this week.
      </TabsContent>
    </Tabs>
  ),
};
