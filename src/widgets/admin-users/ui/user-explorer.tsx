"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { grants, useOperator } from "@/entities/operator";
import { useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { Restricted } from "./account-parts";
import { AccountSearchPanel } from "./account-search";
import { ProfileSearchPanel } from "./profile-search";

import type { parseTab } from "../model/tab";

export type ExplorerTab = NonNullable<ReturnType<typeof parseTab>>;

const TABS: readonly [ExplorerTab, string][] = [
  ["accounts", "users.read"],
  ["fighters", "fighters.read"],
  ["coaches", "coaches.read"],
];

/**
 * AD7, the user explorer (SF-122, SF-123; Claude Design `AdminUsers`, MVP): the
 * Accounts, Fighters and Coaches tabs, each shown only to an operator holding its
 * permission (`users.read`, `fighters.read`, `coaches.read`). Presentation only: every
 * search and read is checked by the backend again. The tab is in the URL (`?tab=`);
 * nothing else is.
 */
export function UserExplorer({ initialTab }: { initialTab: ExplorerTab | null }) {
  const t = useTranslations("controlPlane.users");
  const router = useRouter();
  const operator = useOperator().data;

  const available = operator
    ? TABS.filter(([, permission]) => grants(operator, permission)).map(([tab]) => tab)
    : [];
  const [chosen, setChosen] = useState<ExplorerTab | null>(initialTab);
  const tab = chosen !== null && available.includes(chosen) ? chosen : (available[0] ?? null);

  let body;
  if (operator === undefined) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("searching")}>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  } else if (tab === null) {
    body = <Restricted />;
  } else {
    body = (
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setChosen(next as ExplorerTab);
          router.replace(routeHref("web.admin.users", undefined, { tab: next }));
        }}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label={t("tabs.label")}>
          {available.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="accounts" className="flex flex-col gap-5">
          <AccountSearchPanel />
        </TabsContent>
        <TabsContent value="fighters" className="flex flex-col gap-5">
          <ProfileSearchPanel kind="fighter" />
        </TabsContent>
        <TabsContent value="coaches" className="flex flex-col gap-5">
          <ProfileSearchPanel kind="coach" />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">{body}</PageBody>
    </div>
  );
}
