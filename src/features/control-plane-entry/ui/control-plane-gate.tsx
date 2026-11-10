"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useKeyCheckClock, useOperator, useOperatorKeys, type Operator } from "@/entities/operator";
import { webAuthnSupported } from "@/shared/lib/webauthn";

import { ceremonyProblem, decideGate, type CeremonyProblem } from "../model/gate";
import { ControlPlaneEntry, type EntryView } from "./control-plane-entry";

type Flow =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "recovery" }
  | { kind: "problem"; problem: CeremonyProblem };

/**
 * The Control Plane gate (SF-120, AD0). It renders `children` only while the
 * backend reports an active operator with a key check for this session, and
 * otherwise the matching entry state: checking, unavailable (the same 404 for
 * a non-operator, a suspended or revoked operator), enrolment of the required
 * keys, the key check, its expiry (reverify) and recovery guidance. It decides
 * nothing itself; every operator call is authorized again by the backend.
 *
 * Revocation, suspension or a check ended in another tab show on the next read
 * (focus, the expiry timer, or any ceremony answer), and the children unmount.
 */
export function ControlPlaneGate({
  children,
}: {
  /** The Control Plane, given the operator and "Exit control plane" (ends the key check). */
  children: (operator: Operator, exit: () => Promise<void>) => ReactNode;
}) {
  const t = useTranslations("controlPlane.entry.enroll");
  const read = useOperator();
  const { registerKey, verifyKey, endKeyCheck, reread } = useOperatorKeys();
  const now = useKeyCheckClock(read.data);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [enrolledHere, setEnrolledHere] = useState(false);
  const [hadKeyCheck, setHadKeyCheck] = useState(false);
  const [exiting, setExiting] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const gate = decideGate(read, now, hadKeyCheck && !exiting);
  const open = gate.kind === "open";
  // Derived during render: once open in this page, a missing check reads as "expired".
  if (open && !hadKeyCheck) setHadKeyCheck(true);

  // A ceremony in flight belongs to this page: leaving it cancels the browser prompt.
  useEffect(() => () => abort.current?.abort(), []);

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
      const result = await registerKey(registered === 0 ? t("first") : t("backup"), signal);
      if (result.status === "active") setEnrolledHere(true);
    });

  // Leaving on purpose: the next card asks for the key, not "check expired".
  const exit = async () => {
    setExiting(true);
    try {
      await endKeyCheck();
      setHadKeyCheck(false);
    } finally {
      setExiting(false);
    }
  };

  if (open && !enrolledHere) return <>{children(gate.operator, exit)}</>;

  const problem = flow.kind === "problem" ? flow.problem : undefined;
  const view = ((): EntryView => {
    if (flow.kind === "recovery") return { kind: "recovery" };
    if (flow.kind === "waiting") return { kind: "waiting" };
    if (problem === "unsupported") return { kind: "unsupported" };
    if (problem === "serviceUnavailable") return { kind: "serviceUnavailable" };
    if (problem === "enrollmentExpired") return { kind: "enrollmentExpired" };
    if (enrolledHere && gate.kind !== "unavailable" && gate.kind !== "checking") {
      return { kind: "enrollDone", required: read.data?.security_keys.required ?? 2 };
    }
    switch (gate.kind) {
      case "enroll":
        return {
          kind: "enroll",
          registered: gate.registered,
          required: gate.required,
          problem:
            problem === "duplicate" || problem === "rejected" || problem === "rateLimited"
              ? problem
              : problem === undefined
                ? undefined
                : "failed",
        };
      case "key":
        return {
          kind: "key",
          lapsed: gate.lapsed,
          problem:
            problem === "rateLimited"
              ? "rateLimited"
              : problem === undefined
                ? undefined
                : "failed",
        };
      case "open":
        return { kind: "checking" };
      default:
        return gate;
    }
  })();

  return (
    <ControlPlaneEntry
      view={view}
      onUseKey={() => void run((signal) => verifyKey(signal))}
      onRegister={() => void register(gate.kind === "enroll" ? gate.registered : 0)}
      onCancel={() => {
        abort.current?.abort();
        abort.current = null;
        setFlow({ kind: "idle" });
      }}
      onRecovery={() => setFlow({ kind: "recovery" })}
      onBack={() => setFlow({ kind: "idle" })}
      onContinue={() => {
        setEnrolledHere(false);
        setFlow({ kind: "idle" });
      }}
      onRetry={() => {
        setFlow({ kind: "idle" });
        void read.refetch();
      }}
    />
  );
}
