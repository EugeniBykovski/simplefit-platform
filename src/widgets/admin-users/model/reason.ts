import { AdminUserReadRequestReasonCode } from "@/shared/api/generated/model";

const REASONS: readonly AdminUserReadRequestReasonCode[] = Object.values(
  AdminUserReadRequestReasonCode,
);

/**
 * A read reason from the URL, only if it's one the backend accepts (SF-122). Server-safe:
 * it reads the generated enum, not the client data hooks.
 */
export function parseReason(value: unknown): AdminUserReadRequestReasonCode | null {
  return REASONS.find((reason) => reason === value) ?? null;
}
