"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { GymClassTemplate, GymVenue } from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  archiveGymClassTemplate,
  deactivateGymVenue,
  getGymClassTemplate,
  getGymVenue,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";

import { ConfirmDialog } from "./confirm-dialog";

/**
 * "Deactivate venue" (SF-97 `deactivateGymVenue`): final. The backend
 * refuses while classes are still to come in it (and says how many);
 * classes already held there keep naming it.
 */
export function DeactivateVenueDialog({
  gymId,
  venue: initial,
  trigger,
}: {
  gymId: string;
  venue: GymVenue;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.deactivateVenue");
  const [base, setBase] = useState(initial);
  return (
    <ConfirmDialog
      gymId={gymId}
      trigger={trigger}
      marker={{ "data-deactivate-venue": base.venue_id }}
      title={t("title", { name: base.name })}
      description={t("body")}
      confirmLabel={t("confirm")}
      pendingLabel={t("pending")}
      keepLabel={t("keep")}
      run={() =>
        callWithSession((init) =>
          deactivateGymVenue(gymId, base.venue_id, { expected_revision: base.revision }, init),
        )
      }
      onDone={() => toast.success(t("done", { name: base.name }))}
      onProblem={async (problem) => {
        if (problem.kind !== "stale") return;
        const latest = await callWithSession((init) =>
          getGymVenue(gymId, base.venue_id, init),
        ).catch(() => null);
        if (latest) setBase(latest.venue);
      }}
    />
  );
}

/**
 * "Archive template" (SF-97 `archiveGymClassTemplate`): final. The template
 * takes no new classes; classes and series already scheduled from it stay
 * exactly as they are.
 */
export function ArchiveTemplateDialog({
  gymId,
  template: initial,
  trigger,
}: {
  gymId: string;
  template: GymClassTemplate;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.archiveTemplate");
  const [base, setBase] = useState(initial);
  return (
    <ConfirmDialog
      gymId={gymId}
      trigger={trigger}
      marker={{ "data-archive-template": base.template_id }}
      title={t("title", { title: base.title })}
      description={t("body")}
      confirmLabel={t("confirm")}
      pendingLabel={t("pending")}
      keepLabel={t("keep")}
      run={() =>
        callWithSession((init) =>
          archiveGymClassTemplate(
            gymId,
            base.template_id,
            { expected_revision: base.revision },
            init,
          ),
        )
      }
      onDone={() => toast.success(t("done", { title: base.title }))}
      onProblem={async (problem) => {
        if (problem.kind !== "stale") return;
        const latest = await callWithSession((init) =>
          getGymClassTemplate(gymId, base.template_id, init),
        ).catch(() => null);
        if (latest) setBase(latest.template);
      }}
    />
  );
}
