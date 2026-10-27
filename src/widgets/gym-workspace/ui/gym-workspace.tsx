"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { useGym, type Gym } from "@/entities/gym";
import { ContextSwitcher } from "@/features/session-gate";
import { isApiError } from "@/shared/api/http/api-error";
import { ApplicationSkeleton, FailureView } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import { GymDraftState, GymNotAvailable, GymRestricted } from "./gym-states";

const GymWorkspaceContext = createContext<Gym | undefined>(undefined);

/**
 * The gym the enclosing console shows: the backend's answer for the gym in
 * the path, read and authorized for that id. Pages inside the console render
 * only once it exists, so nothing of another tenant can ever be on screen.
 */
export function useGymWorkspace(): Gym {
  const gym = useContext(GymWorkspaceContext);
  if (gym === undefined) throw new Error("useGymWorkspace outside a gym console");
  return gym;
}

/** Whether a failed read means the gym is not this user's (404) or not for their role (403). */
const statusOf = (error: unknown) => (isApiError(error) ? error.status : undefined);

/**
 * The gym console (`web.app.gym` shell, `/app/gyms/:gymId/**`; SF-88) for
 * the gym named in the path. The id is only a lookup key (ADR 0026 D-G15,
 * D-G23): `GET /api/v1/gyms/{gym_id}` answers only for active staff of that
 * gym, and the console renders its pages only with that answer.
 *
 * - **Not available** (404: unknown, foreign, malformed or revoked; route
 *   rule 9): one state inside the shell that never says which, with the way
 *   to the user's own gyms. A refetch that turns into 404 (a membership
 *   revoked while open) replaces whatever was shown.
 * - **Role-restricted** (403, D-G24): the role-restriction state.
 * - **Draft**: a gym whose setup is not completed is never a console; its
 *   owner continues setup.
 * - **Failure** (offline, 5xx): a retry; a failed background re-read keeps
 *   the gym already shown, since nothing says it changed.
 * - **401**: the session layer refreshes once, then ends the session and the
 *   session gate signs in again (rule 2).
 *
 * Switching gyms changes the path, and the console of the next gym mounts
 * anew: it loads under its own key with a skeleton until it answers (never
 * the previous gym's content), the gym is announced and focus moves to the
 * page.
 */
export function GymWorkspace({ gymId, children }: { gymId: string; children: ReactNode }) {
  const t = useTranslations("gymConsole");
  const query = useGym(gymId);
  // Only the answer for this very id is ever shown.
  const gym = query.data?.id === gymId ? query.data : undefined;
  const status = query.isError ? statusOf(query.error) : undefined;
  const refused = status === 404 || status === 403;

  const announced = gym !== undefined && !refused ? gym : undefined;
  const shownId = announced?.id;
  // The console of another gym mounts anew; the switcher item that had focus
  // is gone, so focus would rest on the document: it moves to the page.
  useEffect(() => {
    if (shownId !== undefined && document.activeElement === document.body) {
      document.getElementById("main")?.focus();
    }
  }, [shownId]);

  let content: ReactNode;
  if (status === 404) content = <GymNotAvailable />;
  else if (status === 403) content = <GymRestricted />;
  else if (gym === undefined) {
    content =
      query.isError && status !== 401 ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ApplicationSkeleton />
      );
  } else if (gym.setup_status === "draft") content = <GymDraftState gym={gym} />;
  else content = <GymWorkspaceContext value={gym}>{children}</GymWorkspaceContext>;

  return (
    <WorkspaceShell
      shell="web.app.gym"
      params={{ gymId }}
      identity={
        announced === undefined ? undefined : (
          <ContextSwitcher
            gym={{
              id: announced.id,
              name: announced.name,
              role: announced.viewer.role,
              locations: announced.locations.length,
            }}
          />
        )
      }
    >
      <p role="status" aria-live="polite" className="sr-only" data-gym-announcement>
        {announced === undefined ? "" : t("announcement", { name: announced.name })}
      </p>
      {content}
    </WorkspaceShell>
  );
}
