import type { HealthResponse } from "@/shared/api/generated/model";

/** Client-side view of API availability. */
export type HealthStatus = "checking" | "online" | "offline";

export function toHealthStatus(query: {
  data: HealthResponse | undefined;
  isPending: boolean;
  isError: boolean;
}): HealthStatus {
  if (query.isError) return "offline";
  if (query.isPending) return "checking";
  return query.data?.status === "ok" ? "online" : "offline";
}
