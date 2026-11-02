"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { Gym } from "@/entities/gym";
import {
  timetableCapabilities,
  useGymClassTemplates,
  useGymInstructors,
  useGymVenues,
  wallDate,
  type GymClassSeries,
} from "@/entities/gym-timetable";
import { ClassDialog, type CreatedClass } from "@/features/gym-timetable-manage";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { SeriesTab, TemplatesTab, VenuesTab } from "./catalog-tabs";
import { TimetableTab, type TimetableState } from "./timetable-view";

/*
 * The gym's timetable (`web.app.gyms._gym-id.timetable`, WG5 with OG10;
 * Claude Design 112 reconciled with SF-97; SF-98) for the gym in the path,
 * on the SF-97 API only:
 *
 * - Timetable (`listGymClassOccurrences`): a week, a day or the week as a
 *   list, every class the backend lists for those dates (all pages), each
 *   at its own wall time in its venue's zone; venue and instructor filters
 *   and cancelled classes are the backend's. A class's details, changing it
 *   and cancelling it (`updateGymClassOccurrence`,
 *   `cancelGymClassOccurrence`, with revisions).
 * - "+ Class" (`createGymClassOccurrence`, `createGymClassSeries`): a
 *   one-time or weekly class with idempotent retries; DST gaps refused and
 *   repeated hours chosen explicitly; a series' skipped dates shown.
 * - Series (`listGymClassSeries`, `getGymClassSeries`,
 *   `updateGymClassSeries`, `cancelGymClassSeries`,
 *   `generateGymClassSeries`).
 * - Templates and venues (list, create, edit, archive / deactivate).
 *
 * Every staff role reads it (`view_workspace`); writes are the owner's and
 * managers' (`manage_timetable`), and a coach may cancel the classes they
 * teach (`cancel_occurrence`). The backend decides every request and
 * nothing changes before it answers. No bookings, waitlists, attendance,
 * occupancy, payments or "friends attending": those domains do not exist,
 * and a capacity is shown as the limit it is.
 */

type Tab = "timetable" | "series" | "templates" | "venues";

/** The page for the console's gym: a new gym is a new page (no state, draft or filter carries over). */
export function GymTimetable({ gym }: { gym: Gym }) {
  return <TimetablePage key={gym.id} gym={gym} />;
}

function TimetablePage({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.timetable");
  const can = timetableCapabilities(gym.viewer);
  const [tab, setTab] = useState<Tab>("timetable");
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const venues = useGymVenues(gym.id, "active");
  const templates = useGymClassTemplates(gym.id, "active");
  const instructors = useGymInstructors(gym.id);
  const activeVenues = venues.data?.venues ?? [];
  const activeTemplates = templates.data?.templates ?? [];
  const catalogReady = venues.data !== undefined && templates.data !== undefined;
  const [state, setState] = useState<TimetableState>(() => ({
    anchor: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    view: "week",
    venueId: "all",
    instructorId: "all",
    includeCancelled: false,
    selectedId: null,
  }));
  const update = (next: Partial<TimetableState>) =>
    setState((current) => ({ ...current, ...next }));

  /** A new class brings the timetable to it: its date, selected; a series to its first date. */
  const onCreated = (created: CreatedClass) => {
    setTab("timetable");
    if (created.kind === "once") {
      update({
        anchor: wallDate(created.occurrence.local_starts_at),
        selectedId: created.occurrence.occurrence_id,
        venueId: "all",
        instructorId: "all",
      });
    } else {
      update({
        anchor: created.series.starts_on,
        selectedId: null,
        venueId: "all",
        instructorId: "all",
      });
    }
  };
  const openSeries = (id: string) => {
    setSeriesId(id);
    setTab("series");
  };
  const showSeries = (series: GymClassSeries) => {
    update({
      anchor: series.starts_on,
      view: "list",
      selectedId: null,
      venueId: "all",
      instructorId: "all",
    });
    setTab("timetable");
  };

  return (
    <div data-gym-timetable data-gym-id={gym.id} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
        {can.canManage && (
          <div className="ml-auto">
            <ClassDialog
              gymId={gym.id}
              venues={activeVenues}
              templates={activeTemplates}
              instructors={instructors.instructors}
              initialDate={state.anchor}
              onCreated={onCreated}
              trigger={
                <Button data-class-create disabled={!catalogReady}>
                  <PlusIcon aria-hidden />
                  {t("addClass")}
                </Button>
              }
            />
          </div>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-4 pt-5.5">
        <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)} className="gap-4">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList aria-label={t("tabs.label")} className="h-auto min-h-9">
              {(["timetable", "series", "templates", "venues"] as const).map((item) => (
                <TabsTrigger key={item} value={item} data-timetable-tab={item}>
                  {t(`tabs.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="timetable">
            <TimetableTab
              gym={gym}
              can={can}
              state={state}
              onState={update}
              venues={activeVenues}
              templates={activeTemplates}
              instructors={instructors.instructors}
              catalogReady={catalogReady}
              onCreated={onCreated}
              onSeries={openSeries}
              onTab={setTab}
            />
          </TabsContent>
          <TabsContent value="series">
            <SeriesTab
              gym={gym}
              can={can}
              venues={activeVenues}
              instructors={instructors.instructors}
              selectedId={seriesId}
              onSelect={setSeriesId}
              onShow={showSeries}
            />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab
              gym={gym}
              can={can}
              venues={activeVenues}
              instructors={instructors.instructors}
            />
          </TabsContent>
          <TabsContent value="venues">
            <VenuesTab gym={gym} can={can} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </div>
  );
}
