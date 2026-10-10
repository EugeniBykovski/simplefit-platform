import { Building2, MapPin, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import type { Price } from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { CtaBand, ExampleTag, Eyebrow, PriceTag, SitePage } from "./sections";

/**
 * L5 · Marketplace · public (`web.marketplace`; Claude Design LandMarket,
 * 1440 × 1520).
 *
 * There is no marketplace domain yet: no listing, search or booking exists.
 * So the page keeps the artboard's composition with nothing pretending to
 * work (SF-43 decision): the search bar and the category tabs are shown but
 * disabled, with a line saying search is not open yet; the six cards are the
 * artboard's example listings inside a region labelled "Example listings";
 * their Book / View gym actions open sign-up (booking needs an account), and
 * no card links to a listing.
 */
const LISTINGS: readonly {
  id: "adam" | "yauheni" | "marek" | "wbc" | "simple" | "tomasz";
  kind: "coach" | "gym";
  avatar: "highlight" | "input" | "primary-muted" | "highlight-gym";
  price: Price;
  per: "perSession" | "perMonth";
  sponsored?: true;
  primaryAction?: true;
}[] = [
  {
    id: "adam",
    kind: "coach",
    avatar: "highlight",
    price: { amount: 45, currency: "EUR" },
    per: "perSession",
    sponsored: true,
  },
  {
    id: "yauheni",
    kind: "coach",
    avatar: "input",
    price: { amount: 50, currency: "EUR" },
    per: "perSession",
    primaryAction: true,
  },
  {
    id: "marek",
    kind: "coach",
    avatar: "input",
    price: { amount: 60, currency: "EUR" },
    per: "perSession",
    primaryAction: true,
  },
  {
    id: "wbc",
    kind: "gym",
    avatar: "primary-muted",
    price: { amount: 79, currency: "EUR" },
    per: "perMonth",
    sponsored: true,
  },
  {
    id: "simple",
    kind: "gym",
    avatar: "highlight-gym",
    price: { amount: 329, currency: "PLN" },
    per: "perMonth",
  },
  {
    id: "tomasz",
    kind: "coach",
    avatar: "input",
    price: { amount: 55, currency: "EUR" },
    per: "perSession",
    primaryAction: true,
  },
];

const TABS = ["coaches", "gyms", "programs", "camps", "events"] as const;

export function MarketplacePage() {
  const t = useTranslations("site.marketplace");
  const common = useTranslations("site.common");
  const format = useFormatter();
  const join = routeHref("web.signup");

  return (
    <SitePage gap="4">
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="type-site-section md:type-site-title-lg">{t("title")}</h1>
      </div>
      <div
        role="search"
        aria-describedby="market-search-note"
        className="flex flex-col gap-2.5 md:flex-row md:items-center"
      >
        <label className="flex h-13.5 min-w-0 items-center gap-2.5 rounded-lg border-[1.5px] border-primary bg-surface px-4.5 type-body-lg font-semibold opacity-60 md:flex-1">
          <Search aria-hidden className="size-4.5 flex-none text-faint-foreground" />
          <span className="sr-only">{t("search")}</span>
          <input
            disabled
            defaultValue={t("query")}
            className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
          />
        </label>
        <label className="flex h-13.5 items-center gap-2.5 rounded-lg border border-border bg-surface px-4.5 type-body-lg font-semibold opacity-60 md:w-65">
          <MapPin aria-hidden className="size-4.5 flex-none text-faint-foreground" />
          <span className="sr-only">{t("city")}</span>
          <input
            disabled
            defaultValue={t("city")}
            className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
          />
        </label>
        <Button size="xl" disabled>
          {t("search")}
        </Button>
      </div>
      <div className="flex flex-col gap-2.5 desktop:flex-row desktop:items-center">
        <div
          role="group"
          aria-label={t("examples")}
          className="grid w-full grid-cols-3 gap-1 rounded-3xl border border-border bg-surface p-1 opacity-60 md:inline-grid md:w-155 md:grid-cols-5"
        >
          {TABS.map((tab, index) => (
            <span
              key={tab}
              aria-disabled
              className={cn(
                "flex h-9 items-center justify-center rounded-full px-3 type-caption whitespace-nowrap",
                index === 0
                  ? "bg-secondary font-extrabold text-secondary-foreground"
                  : "font-bold text-muted-foreground",
              )}
            >
              {t(`tabs.${tab}`)}
            </span>
          ))}
        </div>
        <p className="type-body-sm text-faint-foreground desktop:ml-auto">{t("location")}</p>
      </div>
      <section aria-labelledby="market-examples" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id="market-examples" className="type-label text-faint-foreground">
            {t("examples")}
          </h2>
          <ExampleTag label={common("example")} />
          <p id="market-search-note" className="type-caption text-faint-foreground desktop:ml-auto">
            {t("searchNote")}
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 desktop:grid-cols-3">
          {LISTINGS.map((listing) => (
            <li
              key={listing.id}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-4",
                listing.sponsored ? "border-warning-border" : "border-border",
              )}
            >
              <div className="flex items-center gap-3">
                <ListingAvatar listing={listing} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="type-body-lg font-extrabold">
                      {t(`listings.${listing.id}.name`)}
                    </h3>
                    {listing.sponsored ? (
                      <Badge variant="warning" className="border-warning-border">
                        {t("sponsored")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="type-caption text-muted-foreground">
                    {t(`listings.${listing.id}.meta`)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.keys(
                  t.raw(`listings.${listing.id}.tags` as "listings.adam.tags.1") as Record<
                    string,
                    string
                  >,
                ).map((key) => (
                  <Badge key={key} className="border-0 normal-case">
                    {t(`listings.${listing.id}.tags.${key}` as "listings.adam.tags.1")}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto flex items-center gap-2.5">
                <PriceTag
                  size="sm"
                  amount={formatPrice(format, listing.price)}
                  unit={t(listing.per)}
                />
                <Button
                  asChild
                  size="md"
                  variant={listing.primaryAction ? "primary" : "quiet"}
                  className="ml-auto"
                >
                  <Link href={join}>{listing.kind === "gym" ? t("viewGym") : t("book")}</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand
        tone="surface"
        titleSize="site-section-md"
        title={t("band.title")}
        body={t("band.body")}
        actions={[
          { label: t("band.signIn"), href: routeHref("web.login") },
          { label: t("band.join"), href: join, primary: true },
        ]}
      />
    </SitePage>
  );
}

function ListingAvatar({ listing }: { listing: (typeof LISTINGS)[number] }) {
  const t = useTranslations("site.marketplace.listings");
  if (listing.kind === "gym") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-11.5 flex-none items-center justify-center rounded-md-lg",
          listing.avatar === "primary-muted"
            ? "bg-accent-border text-highlight"
            : "bg-highlight text-highlight-foreground",
        )}
      >
        <Building2 className="size-6" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 flex-none items-center justify-center rounded-full type-body font-display font-bold",
        listing.avatar === "highlight"
          ? "bg-highlight text-highlight-foreground"
          : "bg-input text-foreground",
      )}
    >
      {t(`${listing.id as "adam"}.initials`)}
    </span>
  );
}
