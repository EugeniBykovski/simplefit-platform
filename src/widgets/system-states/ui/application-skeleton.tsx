import { useTranslations } from "next-intl";

import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { LoadingBar, LoadingPill } from "./loading-indicators";

/**
 * LD4 · Web app loading (Claude Design section 35): the content skeleton of a
 * signed-in shell while a route segment renders. It fills only the content
 * column: the real shell (sidebar) stays around it, because the loading
 * boundaries that render it sit inside the shell layouts. The geometry is
 * the artboard's (76 px PageHeader with title bars, status pill and running
 * bar; a 1.55 : 1 two-column body), but it holds no feature content, so any
 * shell can use it.
 */
export function ApplicationSkeleton() {
  const t = useTranslations("system.skeleton");

  return (
    <div role="status" aria-busy aria-label={t("label")} className="flex flex-1 flex-col">
      <PageHeader>
        <span aria-hidden className="flex flex-col gap-1.5">
          <Skeleton motion="shimmer" className="h-2.25 w-37.5" />
          <Skeleton motion="shimmer" className="h-5 w-75 max-w-full rounded-sm" />
        </span>
        <span className="flex-1" />
        <LoadingPill>{t("status")}</LoadingPill>
        <Skeleton motion="shimmer" className="hidden h-10 w-37.5 rounded-md md:block" />
        <LoadingBar className="absolute inset-x-0 -bottom-0.5" />
      </PageHeader>
      <PageBody aria-hidden className="grid flex-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex h-75 gap-6 rounded-4xl border border-accent-strong bg-accent p-6">
            <div className="flex flex-1 flex-col gap-3.5">
              <Skeleton motion="shimmer" tone="accent" className="h-3 w-35" />
              <Skeleton
                motion="shimmer"
                tone="accent"
                className="h-24 w-65 max-w-full rounded-lg"
              />
              <div className="flex gap-2">
                <Skeleton motion="shimmer" tone="accent" className="h-7.5 w-22.5 rounded-full" />
                <Skeleton motion="shimmer" tone="accent" className="h-7.5 w-17.5 rounded-full" />
                <Skeleton motion="shimmer" tone="accent" className="h-7.5 w-27.5 rounded-full" />
              </div>
              <div className="mt-auto flex gap-2.5">
                <Skeleton motion="shimmer" tone="accent" className="h-11 w-37.5 rounded-lg" />
                <Skeleton motion="shimmer" tone="accent" className="h-11 w-27.5 rounded-lg" />
              </div>
            </div>
            <div className="hidden w-60 flex-col gap-3 rounded-2xl bg-accent-strong/40 p-4.5 xl:flex">
              <Skeleton motion="shimmer" tone="accent" className="h-2.5 w-3/5" />
              <Skeleton motion="shimmer" tone="accent" className="h-10 w-7/10 rounded-md" />
              <Skeleton motion="shimmer" tone="accent" className="h-2.5 w-9/10" />
              <Skeleton motion="shimmer" tone="accent" className="h-2.5 w-4/5" />
            </div>
          </div>
          <SkeletonCard>
            <Skeleton motion="shimmer" className="h-3.5 w-30" />
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
                >
                  <Skeleton motion="shimmer" className="h-2 w-2/5" />
                  <Skeleton motion="shimmer" className="h-3 w-7/10" />
                  <Skeleton motion="shimmer" className="h-2 w-11/20" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard className="flex-1">
            <Skeleton motion="shimmer" className="h-3 w-40" />
            <Skeleton motion="shimmer" className="h-37.5 w-full rounded-lg" />
          </SkeletonCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {["h-15", "h-37.5", "h-22.5"].map((height) => (
            <SkeletonCard key={height}>
              <Skeleton motion="shimmer" className="h-2.5 w-[45%]" />
              <Skeleton motion="shimmer" className="h-7 w-[65%] rounded-sm" />
              <Skeleton motion="shimmer" className={`${height} w-full rounded-md`} />
            </SkeletonCard>
          ))}
        </div>
      </PageBody>
    </div>
  );
}

function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4.5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
