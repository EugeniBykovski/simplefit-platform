"use client";

import { KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  onKeyEnrollmentRequest,
  useKeyCheckClock,
  useOperator,
  useOperatorKeys,
  type Operator,
} from "@/entities/operator";
import { useRouter } from "@/shared/i18n/navigation";
import { webAuthnSupported } from "@/shared/lib/webauthn";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { ceremonyProblem, decideEnrollment, decideGate, type CeremonyProblem } from "../model/gate";
import { ControlPlaneEntry, type EntryView } from "./control-plane-entry";

type Flow =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "recovery" }
  | { kind: "problem"; problem: CeremonyProblem };

/**
 * The Control Plane gate (SF-120, AD0; SF-157). It renders `children` while the
 * backend reports a pending or active operator: the Control Plane opens at session
 * assurance, whatever the sign-in method. Otherwise it shows checking, the load
 * failure or the one unavailable answer (the same 404 for a non-operator, a
 * suspended or a revoked operator). It decides nothing itself; every operator call
 * is authorized again by the backend.
 *
 * Key registration comes when it is needed: a pending operator sees a notice above
 * the Control Plane, and an action answered `enrollment_required` asks for it
 * (`requestKeyEnrollment`). Then the AD0 registration card replaces the page until
 * the keys are registered or the person goes back. Key checks for actions run in
 * the action dialogs, as before.
 *
 * Revocation or suspension in another tab shows on the next read (focus, or any
 * ceremony answer), and the children unmount.
 */
export function ControlPlaneGate({
  children,
}: {
  /** The Control Plane, given the operator and "Exit control plane" (ends the key check, leaves). */
  children: (operator: Operator, exit: () => Promise<void>) => ReactNode;
}) {
  const t = useTranslations("controlPlane.entry");
  const read = useOperator();
  const { registerKey, endKeyCheck, reread } = useOperatorKeys();
  const now = useKeyCheckClock(read.data);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledHere, setEnrolledHere] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const router = useRouter();

  const gate = decideGate(read);

  // "Exit control plane": ends this session's key check, then leaves. The session
  // stays (signing out is the account's), so the Control Plane would open again.
  const exit = async () => {
    await endKeyCheck();
    router.push(routeHref("web.root"));
  };

  // An action answered `enrollment_required`: show key registration.
  useEffect(() => onKeyEnrollmentRequest(() => setEnrolling(true)), []);
  // A ceremony in flight belongs to this page: leaving it cancels the browser prompt.
  useEffect(() => () => abort.current?.abort(), []);

  const leave = () => {
    abort.current?.abort();
    abort.current = null;
    setFlow({ kind: "idle" });
    setEnrolling(false);
    setEnrolledHere(false);
  };

  const run = async (ceremony: (signal: AbortSignal) => Promise<unknown>) => {
    if (!webAuthnSupported()) {
      setFlow({ kind: "problem", problem: "unsupported" });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setFlow({ kind: "waiting" });
    try {
      await ceremony(controller.signal);
      if (!controller.signal.aborted) setFlow({ kind: "idle" });
    } catch (error) {
      if (controller.signal.aborted) return;
      const problem = ceremonyProblem(error);
      if (problem === "stale") {
        await reread();
        setFlow({ kind: "idle" });
      } else {
        setFlow({ kind: "problem", problem });
      }
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  const register = (registered: number) =>
    run(async (signal) => {
      const result = await registerKey(
        registered === 0 ? t("enroll.first") : t("enroll.backup"),
        signal,
      );
      if (result.status === "active") setEnrolledHere(true);
    });

  if (gate.kind !== "open") {
    return (
      <ControlPlaneEntry
        view={gate}
        {...noActions}
        onRetry={() => {
          setFlow({ kind: "idle" });
          void read.refetch();
        }}
      />
    );
  }

  const operator = gate.operator;
  const enrollment = decideEnrollment(operator, now);

  if (!enrolling || (enrollment.kind === "registered" && !enrolledHere)) {
    return (
      <>
        {operator.status === "pending_enrollment" && (
          <div data-keys-needed className="border-b bg-background px-4 py-2.5 sm:px-12">
            <Notice
              tone="amber"
              icon={KeyRoundIcon}
              action={
                <Button size="sm" variant="quiet" onClick={() => setEnrolling(true)}>
                  {t("keysNeeded.action")}
                </Button>
              }
            >
              {t("keysNeeded.body", { required: operator.security_keys.required })}
            </Notice>
          </div>
        )}
        {children(operator, exit)}
      </>
    );
  }

  const problem = flow.kind === "problem" ? flow.problem : undefined;
  const view = ((): EntryView => {
    if (flow.kind === "recovery") return { kind: "recovery" };
    if (flow.kind === "waiting") return { kind: "waiting" };
    if (problem === "unsupported") return { kind: "unsupported" };
    if (problem === "serviceUnavailable") return { kind: "serviceUnavailable" };
    if (problem === "enrollmentExpired") return { kind: "enrollmentExpired" };
    if (enrolledHere) return { kind: "enrollDone", required: operator.security_keys.required };
    if (enrollment.kind === "enrollmentExpired") return enrollment;
    if (enrollment.kind === "registered") {
      return { kind: "enrollDone", required: operator.security_keys.required };
    }
    return {
      kind: "enroll",
      registered: enrollment.registered,
      required: enrollment.required,
      problem:
        problem === "duplicate" || problem === "rejected" || problem === "rateLimited"
          ? problem
          : problem === undefined
            ? undefined
            : "failed",
    };
  })();

  return (
    <ControlPlaneEntry
      view={view}
      {...noActions}
      onRegister={() => void register(enrollment.kind === "enroll" ? enrollment.registered : 0)}
      onCancel={() => {
        abort.current?.abort();
        abort.current = null;
        setFlow({ kind: "idle" });
      }}
      onRecovery={() => setFlow({ kind: "recovery" })}
      onBack={() => setFlow({ kind: "idle" })}
      onContinue={leave}
      onLeave={leave}
      onRetry={() => {
        setFlow({ kind: "idle" });
        void read.refetch();
      }}
    />
  );
}

const ignore = () => {};
const noActions = {
  onUseKey: ignore,
  onRegister: ignore,
  onCancel: ignore,
  onRecovery: ignore,
  onBack: ignore,
  onContinue: ignore,
  onRetry: ignore,
};
