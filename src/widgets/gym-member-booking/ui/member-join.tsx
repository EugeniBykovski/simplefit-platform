"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  membershipProblem,
  useGymJoinPreview,
  useJoinGym,
  type MembershipProblem,
} from "@/features/gym-membership-manage";
import type { GymJoinPreviewResponsePreview, MyGymMembership } from "@/shared/api/generated/model";
import { Link } from "@/shared/i18n/navigation";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref, webGuards } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";

import { useMembershipProblemText } from "./membership-shared";
import { MemberHeader } from "./shared";

/**
 * Joining a gym with its code (`web.app.me.gyms.join`, SF-134). No web board
 * exists: A03's code entry and OF6's "Send join request", without A03's QR, six
 * letters, role or group, which the domain does not have (D-WEB-GYM-MEMBER-JOIN).
 *
 * The code is held only while it is being typed. It goes in request bodies, never
 * a URL or a store, and is checked by the backend alone: an unknown, malformed,
 * disabled or rotated code gets one answer, so nothing here can tell them apart.
 * The preview changes nothing; joining is a separate press, sent once. Whether it
 * waits for the gym is the backend's answer, not the preview's hint or this page's.
 */
const CONTINUATION = { returnTo: "/app/me/gyms/join" };

/** The longest code the backend reads (`normalize_join_code`). */
const MAX_LENGTH = 32;

type Step =
  | { kind: "code" }
  | { kind: "preview"; code: string; preview: GymJoinPreviewResponsePreview }
  | { kind: "result"; membership: MyGymMembership; gym: string }
  | { kind: "already" }
  | { kind: "registration" };

export function MemberJoin() {
  const t = useTranslations("gymMembership.join");
  const [step, setStep] = useState<Step>({ kind: "code" });

  return (
    <>
      <MemberHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-5">
        <div className="flex w-full max-w-140 flex-col gap-4" data-member-join>
          {step.kind === "code" && (
            <CodeStep
              onPreview={(code, preview) => setStep({ kind: "preview", code, preview })}
              onRegistration={() => setStep({ kind: "registration" })}
            />
          )}
          {step.kind === "preview" && (
            <PreviewStep
              code={step.code}
              preview={step.preview}
              onBack={() => setStep({ kind: "code" })}
              onResult={(membership) =>
                setStep({ kind: "result", membership, gym: step.preview.gym.name })
              }
              onAlready={() => setStep({ kind: "already" })}
              onRegistration={() => setStep({ kind: "registration" })}
            />
          )}
          {step.kind === "result" &&
            (step.membership.status === "active" ? (
              <Outcome
                state="active"
                title={t("active.title", { gym: step.gym })}
                body={t("active.body")}
              >
                <Button asChild className="self-start">
                  <Link
                    href={routeHref("web.app.me.gyms._gym-id.classes", {
                      gymId: step.membership.gym.gym_id,
                    })}
                  >
                    {t("active.action")}
                  </Link>
                </Button>
              </Outcome>
            ) : (
              <Outcome
                state={step.membership.status}
                title={t("requested.title", { gym: step.gym })}
                body={t("requested.body")}
              >
                <Button asChild className="self-start">
                  <Link href={routeHref("web.app.me.gyms")}>{t("requested.action")}</Link>
                </Button>
              </Outcome>
            ))}
          {step.kind === "already" && (
            <Outcome state="already-member" title={t("already.title")} body={t("already.body")}>
              <Button asChild className="self-start">
                <Link href={routeHref("web.app.me.gyms")}>{t("already.action")}</Link>
              </Button>
            </Outcome>
          )}
          {step.kind === "registration" && (
            <Outcome
              state="registration"
              title={t("registration.title")}
              body={t("registration.body")}
            >
              <Button asChild className="self-start">
                <Link href={withContinuation(webGuards.entry, CONTINUATION)}>
                  {t("registration.action")}
                </Link>
              </Button>
            </Outcome>
          )}
        </div>
      </PageBody>
    </>
  );
}

/** A final answer: its heading takes the focus, so the change is announced. */
function Outcome({
  state,
  title,
  body,
  children,
}: {
  state: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex flex-col gap-3" data-join-state={state}>
      <h2 ref={heading} tabIndex={-1} className="type-h3 font-display outline-none">
        {title}
      </h2>
      <p className="type-body text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

function CodeStep({
  onPreview,
  onRegistration,
}: {
  onPreview: (code: string, preview: GymJoinPreviewResponsePreview) => void;
  onRegistration: () => void;
}) {
  const t = useTranslations("gymMembership.join");
  const text = useMembershipProblemText();
  const lookup = useGymJoinPreview();
  const [code, setCode] = useState("");
  const [missing, setMissing] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const problem: MembershipProblem | null = lookup.isError ? membershipProblem(lookup.error) : null;
  const message =
    problem === null
      ? missing
        ? t("required")
        : null
      : problem.kind === "notFound"
        ? t("notFound")
        : text(problem);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (value === "") {
      lookup.reset();
      setMissing(true);
      return;
    }
    setMissing(false);
    lookup.mutate(value, {
      onSuccess: (answer) => onPreview(value, answer.preview),
      onError: (error) => {
        if (membershipProblem(error).kind === "registration") onRegistration();
      },
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate data-join-state="code">
      <p className="type-body text-muted-foreground">{t("lead")}</p>
      <Field data-invalid={message !== null || undefined}>
        <FieldLabel htmlFor={inputId}>{t("label")}</FieldLabel>
        <Input
          ref={input}
          id={inputId}
          fieldSize="lg"
          value={code}
          maxLength={MAX_LENGTH}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={message === null ? hintId : `${hintId} ${errorId}`}
          aria-invalid={message !== null || undefined}
          className="font-mono uppercase"
          placeholder="ABCD-EFGH"
          onChange={(event) => {
            setCode(event.target.value);
            setMissing(false);
            if (lookup.isError) lookup.reset();
          }}
        />
        <FieldDescription id={hintId}>{t("hint")}</FieldDescription>
      </Field>
      {message !== null && (
        <Notice
          id={errorId}
          tone={problem?.kind === "limited" ? "amber" : "coral"}
          role="alert"
          data-join-problem={problem?.kind ?? "required"}
        >
          {message}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" aria-busy={lookup.isPending || undefined} disabled={lookup.isPending}>
          {lookup.isPending && <Spinner />}
          {lookup.isPending ? t("finding") : t("find")}
        </Button>
        <Button asChild variant="quiet">
          <Link href={routeHref("web.app.me.gyms")}>{t("back")}</Link>
        </Button>
      </div>
    </form>
  );
}

function PreviewStep({
  code,
  preview,
  onBack,
  onResult,
  onAlready,
  onRegistration,
}: {
  code: string;
  preview: GymJoinPreviewResponsePreview;
  onBack: () => void;
  onResult: (membership: MyGymMembership) => void;
  onAlready: () => void;
  onRegistration: () => void;
}) {
  const t = useTranslations("gymMembership.join");
  const text = useMembershipProblemText();
  const join = useJoinGym();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const problem = join.isError ? membershipProblem(join.error) : null;

  return (
    <div className="flex flex-col gap-4" data-join-state="preview">
      <h2 ref={heading} tabIndex={-1} className="type-label text-faint-foreground outline-none">
        {t("preview.heading")}
      </h2>
      <div className="flex flex-col gap-2 rounded-3xl border bg-surface px-5 py-4">
        <p className="type-title font-display break-words" data-join-gym>
          {preview.gym.name}
        </p>
        <p className="type-body-sm text-muted-foreground">
          {t(preview.requires_approval ? "preview.approval" : "preview.instant")}
        </p>
      </div>
      {problem !== null && (
        <Notice
          tone={problem.kind === "limited" ? "amber" : "coral"}
          role="alert"
          data-join-problem={problem.kind}
        >
          {problem.kind === "notFound" ? t("notFound") : text(problem)}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2.5">
        <Button
          aria-busy={join.isPending || undefined}
          disabled={join.isPending}
          onClick={() =>
            join.mutate(code, {
              onSuccess: (answer) => onResult(answer.membership),
              onError: (error) => {
                const kind = membershipProblem(error).kind;
                if (kind === "alreadyMember") onAlready();
                if (kind === "registration") onRegistration();
              },
            })
          }
        >
          {join.isPending && <Spinner />}
          {join.isPending
            ? t("preview.submitting")
            : t(preview.requires_approval ? "preview.submitApproval" : "preview.submitInstant")}
        </Button>
        <Button variant="quiet" disabled={join.isPending} onClick={onBack}>
          {t("preview.other")}
        </Button>
      </div>
      <p className="type-caption text-faint-foreground">{t("privacy")}</p>
    </div>
  );
}
