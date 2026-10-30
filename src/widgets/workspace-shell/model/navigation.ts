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
  UserCheckIcon,
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
      { key: "training", items: ["home", "board", "training", "progress", "coaches"] },
      { key: "social", items: ["community", "discover", "profile", "market"] },
      { key: "account", items: ["calendar", "messages", "settings"] },
    ],
    icons: {
      home: HouseIcon,
      board: NetworkIcon,
      training: DumbbellIcon,
      progress: ChartColumnIcon,
      coaches: UserCheckIcon,
      community: UsersIcon,
      discover: SearchIcon,
      profile: UserIcon,
      market: ShoppingBagIcon,
      calendar: CalendarIcon,
      messages: MessageSquareIcon,
      settings: SlidersHorizontalIcon,
    },
  },
  // The Coach MVP (Claude Design 1791982482-71e3, CR-16; Fighters linked by
  // SF-58, 1792056621-3707; SF-64, 1792490047-d551): the dashboard, Fighters
  // and Sessions, and the sections
  // whose domains do not exist yet marked Soon. The registry keeps
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
    soon: ["settings"],
  },
  // The gym console MVP (SF-88, D-WEB-GYM-CONSOLE-MVP): Dashboard, since
  // SF-94 Coaches & staff (every staff role may view the roster) and since
  // SF-96 Members (every staff role; a coach's roster waits for classes and
  // the page says so) have their domains; GymWebNav's other items are shown,
  // marked Soon and not linked, until their feature tickets build them.
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
    soon: [
      "board",
      "reports",
      "leads",
      "timetable",
      "bookings",
      "attendance",
      "shared",
      "community",
      "challenges",
      "sparring",
      "announcements",
      "memberships",
      "revenue",
      "store",
      "promote",
      "branding",
      "settings",
    ],
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
