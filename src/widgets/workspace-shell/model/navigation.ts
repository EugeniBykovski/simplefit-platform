import {
  BellIcon,
  BriefcaseIcon,
  BrushIcon,
  Building2Icon,
  CalendarIcon,
  ChartColumnIcon,
  CircleCheckIcon,
  DumbbellIcon,
  FileTextIcon,
  FlagIcon,
  FunnelIcon,
  GlobeIcon,
  HeadphonesIcon,
  HouseIcon,
  IdCardIcon,
  LayoutGridIcon,
  ListIcon,
  LockIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  NetworkIcon,
  PlugIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  ShoppingBagIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  SwordsIcon,
  TagIcon,
  TicketIcon,
  ToggleRightIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

/** The sidebar shells of SF-31 (`web.app.*` workspaces, partner portal, admin). */
export type SidebarShellId =
  "web.app.fighter" | "web.app.coach" | "web.app.gym" | "web.sponsor" | "web.admin";

/** Key of the shell in the `shells` message namespace. */
export type ShellMessages = "fighter" | "coach" | "gym" | "sponsor" | "admin";

type ShellNavigation = {
  messages: ShellMessages;
  /**
   * Sections and their item order, as in the shell's nav artboard
   * (FighterWebNav, CoachWebNav, GymWebNav, SponsorNav, AdminNav). The items
   * are the registry `navItems` keys; their targets come from the registry.
   */
  sections: readonly { key: string; items: readonly string[] }[];
  icons: Record<string, LucideIcon>;
  /**
   * Items shown but not available yet (their domain does not exist): a
   * labelled, unlinked row marked "Soon", never a link to a placeholder.
   */
  soon?: readonly string[];
  /** The profile context the shell belongs to: its sidebar carries the context switcher. */
  context?: "fighter" | "coach";
};

export const shellNavigation: Record<SidebarShellId, ShellNavigation> = {
  "web.app.fighter": {
    messages: "fighter",
    context: "fighter",
    sections: [
      { key: "training", items: ["home", "board", "training", "progress"] },
      { key: "social", items: ["community", "discover", "profile", "market"] },
      { key: "account", items: ["calendar", "messages", "settings"] },
    ],
    icons: {
      home: HouseIcon,
      board: NetworkIcon,
      training: DumbbellIcon,
      progress: ChartColumnIcon,
      community: UsersIcon,
      discover: SearchIcon,
      profile: UserIcon,
      market: ShoppingBagIcon,
      calendar: CalendarIcon,
      messages: MessageSquareIcon,
      settings: SlidersHorizontalIcon,
    },
  },
  // The Coach MVP (Claude Design 1791982482-71e3, CR-16): the dashboard, and
  // the sections whose domains do not exist yet marked Soon. The registry keeps
  // the Route Gallery's twelve items and their placeholder routes
  // (D-WEB-COACH-HOME-MVP).
  "web.app.coach": {
    messages: "coach",
    context: "coach",
    sections: [
      { key: "coaching", items: ["dashboard", "fighters", "programs"] },
      { key: "account", items: ["settings"] },
    ],
    icons: {
      dashboard: HouseIcon,
      fighters: UserIcon,
      programs: CalendarIcon,
      settings: SlidersHorizontalIcon,
    },
    soon: ["fighters", "programs", "settings"],
  },
  "web.app.gym": {
    messages: "gym",
    sections: [
      { key: "overview", items: ["dashboard", "board", "reports"] },
      { key: "people", items: ["members", "leads", "staff"] },
      { key: "schedule", items: ["timetable", "bookings", "attendance", "shared"] },
      { key: "community", items: ["community", "challenges", "sparring", "announcements"] },
      { key: "money", items: ["memberships", "revenue", "store", "promote"] },
      { key: "setup", items: ["branding", "settings"] },
    ],
    icons: {
      dashboard: LayoutGridIcon,
      board: NetworkIcon,
      reports: ChartColumnIcon,
      members: UsersIcon,
      leads: FunnelIcon,
      staff: IdCardIcon,
      timetable: CalendarIcon,
      bookings: TicketIcon,
      attendance: CircleCheckIcon,
      shared: UsersRoundIcon,
      community: UsersIcon,
      challenges: TrophyIcon,
      sparring: SwordsIcon,
      announcements: MegaphoneIcon,
      memberships: TagIcon,
      revenue: WalletIcon,
      store: StoreIcon,
      promote: MegaphoneIcon,
      branding: BrushIcon,
      settings: SlidersHorizontalIcon,
    },
  },
  "web.sponsor": {
    messages: "sponsor",
    // Creative (a campaign wizard step) and Analytics (GAP-SPONSOR-ANALYTICS-INDEX)
    // have no route in the registry, so they are not shown (route-architecture §14).
    sections: [
      { key: "partner", items: ["overview", "applications"] },
      { key: "campaigns", items: ["campaigns", "challenges", "events"] },
      { key: "results", items: ["invoices"] },
      { key: "account", items: ["settings"] },
    ],
    icons: {
      overview: LayoutGridIcon,
      applications: FileTextIcon,
      campaigns: MegaphoneIcon,
      challenges: FlagIcon,
      events: CalendarIcon,
      invoices: ReceiptIcon,
      settings: SlidersHorizontalIcon,
    },
  },
  "web.admin": {
    messages: "admin",
    sections: [
      { key: "platform", items: ["overview", "tenants", "users"] },
      {
        key: "revenue",
        items: ["revenue", "subscriptions", "transactions", "payments", "pricing"],
      },
      { key: "partners", items: ["sponsors", "campaigns", "enterprise"] },
      { key: "trust", items: ["moderation", "enforcement", "support", "privacy", "audit"] },
      { key: "system", items: ["flags", "notifications", "integrations", "markets", "staff"] },
    ],
    icons: {
      overview: LayoutGridIcon,
      tenants: Building2Icon,
      users: UserIcon,
      revenue: TrendingUpIcon,
      subscriptions: TagIcon,
      transactions: ReceiptIcon,
      payments: WalletIcon,
      pricing: SlidersHorizontalIcon,
      sponsors: BriefcaseIcon,
      campaigns: MegaphoneIcon,
      enterprise: Building2Icon,
      moderation: ShieldIcon,
      enforcement: FlagIcon,
      support: HeadphonesIcon,
      privacy: LockIcon,
      audit: ListIcon,
      flags: ToggleRightIcon,
      notifications: BellIcon,
      integrations: PlugIcon,
      markets: GlobeIcon,
      staff: UserCogIcon,
    },
  },
};
