"use client";

import { ArrowRightIcon, BellIcon, PlusIcon, TimerIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { ThemeSwitcher } from "@/features/switch-theme";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/*
 * Developer tool (development builds only; see app/[locale]/dev/design-system).
 * Copy here is developer-facing and intentionally not translated.
 */

const typography = [
  ["type-display", "02:14"],
  ["type-h1", "Heading 1 · Fight camp"],
  ["type-h2", "Heading 2 · Sparring planner"],
  ["type-h3", "Heading 3 · Next session"],
  ["type-title", "Title · Technical · Warsaw BC"],
  ["type-body", "Body · Interface and body copy, calm and legible between rounds."],
  ["type-body-sm", "Body small · Metadata and secondary copy."],
  ["type-label", "Label · Graphite · Foundation"],
  ["type-caption", "Caption · Arrive 17:50 · Ring 2"],
] as const;

// Literal class names so Tailwind generates them.
const semanticSwatches = [
  ["background", "bg-background text-foreground"],
  ["surface", "bg-surface text-surface-foreground"],
  ["surface-subtle", "bg-surface-subtle text-foreground"],
  ["surface-elevated", "bg-surface-elevated text-foreground"],
  ["muted", "bg-muted text-muted-foreground"],
  ["primary", "bg-primary text-primary-foreground"],
  ["secondary", "bg-secondary text-secondary-foreground"],
  ["accent", "bg-accent text-accent-foreground"],
  ["success", "bg-success text-success-foreground"],
  ["warning", "bg-warning text-warning-foreground"],
  ["destructive", "bg-destructive text-destructive-foreground"],
  ["info", "bg-info text-info-foreground"],
] as const;

const rawPalette = [
  "--graphite-950",
  "--graphite-900",
  "--graphite-850",
  "--graphite-700",
  "--bone",
  "--olive-200",
  "--olive-300",
  "--olive-400",
  "--olive-600",
  "--olive-900",
  "--amber",
  "--coral",
] as const;

const buttonVariants = ["primary", "secondary", "outline", "ghost", "destructive", "link"] as const;
const badgeVariants = [
  "neutral",
  "primary",
  "accent",
  "success",
  "warning",
  "destructive",
  "info",
  "outline",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`ds-${title}`} className="flex flex-col gap-4">
      <h2 id={`ds-${title}`} className="type-label text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DesignSystemGallery() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:py-14"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="type-label text-primary">SimpleFit · Visual system 2026</p>
          <h1 className="type-h1">Design system</h1>
          <p className="max-w-2xl text-muted-foreground">
            Graphite × Olive primitives and tokens. Development builds only.
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          {typography.map(([className, sample]) => (
            <div key={className} className="flex flex-wrap items-baseline gap-4">
              <code className="w-28 shrink-0 type-caption text-muted-foreground">{className}</code>
              <p className={className}>{sample}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Semantic colours">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {semanticSwatches.map(([name, className]) => (
            <li
              key={name}
              className={`flex h-20 items-end rounded-lg border border-border p-3 type-body-sm font-semibold ${className}`}
            >
              {name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Raw palette (tokens.css only)">
        <ul className="flex flex-wrap gap-3">
          {rawPalette.map((token) => (
            <li key={token} className="flex flex-col gap-1">
              {/* Runtime-computed swatch colour (documented exception). */}
              <span
                className="block size-14 rounded-md border border-border"
                style={{ backgroundColor: `var(${token})` }}
              />
              <code className="type-caption text-muted-foreground">{token.slice(2)}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">
            Start round <ArrowRightIcon aria-hidden />
          </Button>
          <Button size="icon" variant="secondary" aria-label="Add">
            <PlusIcon aria-hidden />
          </Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <Button variant="secondary" loading>
            Finish round
          </Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ds-email">Email</FieldLabel>
            <Input id="ds-email" type="email" placeholder="fighter@example.com" />
            <FieldDescription>We never share it.</FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="ds-promo">Promo code</FieldLabel>
            <Input id="ds-promo" defaultValue="SPRING10" aria-invalid />
            <FieldError>This code expired on Sep 30</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-notes">Notes</FieldLabel>
            <Textarea id="ds-notes" placeholder="How did the session feel?" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-gym">Gym</FieldLabel>
            <Select defaultValue="warsaw">
              <SelectTrigger id="ds-gym" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warsaw">Warsaw Boxing Club</SelectItem>
                <SelectItem value="berlin">Berlin Boxing Gym</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="ds-terms" defaultChecked />
              <Label htmlFor="ds-terms">Remind me before sessions</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ds-disabled" disabled />
              <Label htmlFor="ds-disabled">Disabled option</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ds-gym-mode" defaultChecked />
              <Label htmlFor="ds-gym-mode">Gym mode</Label>
            </div>
          </div>
          <RadioGroup defaultValue="monthly" aria-label="Billing cycle">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="monthly" id="ds-monthly" />
              <Label htmlFor="ds-monthly">Monthly</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="annual" id="ds-annual" />
              <Label htmlFor="ds-annual">Annual</Label>
            </div>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Next session</CardTitle>
              <CardDescription>Technical · Warsaw BC</CardDescription>
              <CardAction>
                <Badge variant="success">Booked</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="type-display">18:00</p>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="type-caption text-muted-foreground">Arrive 17:50 · Ring 2</span>
              <Button size="sm">Check in</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Loading</CardTitle>
              <CardDescription>Skeletons keep the card geometry.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner label="Loading sessions" />
                <span className="type-body-sm">Spinner for short waits only</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Overlays and feedback">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent closeLabel="Close">
              <DialogHeader>
                <DialogTitle>Cancel booking?</DialogTitle>
                <DialogDescription>Your spot is released to the waitlist.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive">Cancel booking</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Edit session</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Round timer">
                <TimerIcon aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Round timer</TooltipContent>
          </Tooltip>
          <Button variant="ghost" onClick={() => toast.success("Session saved")}>
            <BellIcon aria-hidden /> Success toast
          </Button>
          <Button variant="ghost" onClick={() => toast.error("Payment failed")}>
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Tabs, avatar, separator">
        <Tabs defaultValue="today" className="max-w-md">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="camp">Camp</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="type-body-sm text-muted-foreground">
            Two sessions planned.
          </TabsContent>
          <TabsContent value="week" className="type-body-sm text-muted-foreground">
            Nine sessions this week.
          </TabsContent>
          <TabsContent value="camp" className="type-body-sm text-muted-foreground">
            Week 6 of 10.
          </TabsContent>
        </Tabs>
        <Separator />
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>YB</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>MK</AvatarFallback>
          </Avatar>
        </div>
      </Section>
    </main>
  );
}
