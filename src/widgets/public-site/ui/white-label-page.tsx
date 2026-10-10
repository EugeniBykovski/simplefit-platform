import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";

import { LeadForm } from "./lead-form";
import { CheckList, ExampleTag, Lead, SitePage } from "./sections";

/**
 * PR5 · White label (`web.white-label`; Claude Design WhiteLabel,
 * 1440 × 1010): a future offering ("Coming 2027 · UI only", as the artboard
 * says), with three example branded apps and the request form, which is
 * disabled until requests open (SF-43 decision).
 *
 * The example apps draw a federation, an academy and SimpleFit in their own
 * colours; the brand palette has no blue, so the federation app uses the
 * neutral information tones (recorded as a design deviation).
 */
export function WhiteLabelPage() {
  const t = useTranslations("site.whiteLabel");
  const common = useTranslations("site.common");
  const items = Array.from({ length: 5 }, (_, index) => t(`items.${index + 1}` as "items.1"));

  return (
    <SitePage gap="10">
      <div className="grid gap-10 desktop:grid-cols-[minmax(0,1fr)_480px] desktop:gap-16">
        <div className="flex min-w-0 flex-col gap-5">
          <Badge variant="warning">{t("badge")}</Badge>
          <h1 className="type-site-section md:type-site-hero-sm">
            {t("title")} <br />
            {t("titleSecond")}
          </h1>
          <Lead size="md">{t("lead")}</Lead>
          <CheckList items={items} size="lg" />
          <figure aria-label={t("apps.description")} className="flex flex-wrap items-start gap-3.5">
            <span aria-hidden className="contents">
              <AppMock name={t("apps.federation")} tone="federation" />
              <AppMock name={t("apps.academy")} tone="academy" />
              <AppMock name={t("apps.simplefit")} tone="simplefit" />
            </span>
            <ExampleTag label={common("example")} />
          </figure>
        </div>
        <LeadForm
          title={t("form.title")}
          fields={[
            {
              key: "organization",
              label: t("form.organization"),
              placeholder: t("form.organizationPlaceholder"),
            },
            {
              key: "members",
              label: t("form.members"),
              placeholder: t("form.membersPlaceholder"),
              half: true,
            },
            {
              key: "launch",
              label: t("form.launch"),
              placeholder: t("form.launchPlaceholder"),
              half: true,
            },
            { key: "domain", label: t("form.domain"), placeholder: t("form.domainPlaceholder") },
            {
              key: "email",
              label: t("form.email"),
              placeholder: t("form.emailPlaceholder"),
              type: "email",
            },
          ]}
          submit={t("form.submit")}
          unavailable={t("form.unavailable")}
        />
      </div>
    </SitePage>
  );
}

/** A 120 × 220 phone of the example apps: brand bar, two content blocks, the app's name. */
function AppMock({ name, tone }: { name: string; tone: "federation" | "academy" | "simplefit" }) {
  const tones = {
    federation: { body: "bg-surface-sunken", bar: "bg-info" },
    academy: { body: "bg-destructive-subtle", bar: "bg-destructive" },
    simplefit: { body: "bg-background", bar: "bg-primary" },
  } as const;
  return (
    <span
      className={cn(
        "flex h-55 w-30 flex-col gap-2 rounded-3xl border-5 border-border px-2.5 py-3.5",
        tones[tone].body,
      )}
    >
      <span className={cn("h-6.5 rounded-sm", tones[tone].bar)} />
      <span className="h-15 rounded-md bg-foreground/8" />
      <span className="h-10 rounded-md bg-foreground/6" />
      <span className="mt-auto type-label text-foreground">{name}</span>
    </span>
  );
}
