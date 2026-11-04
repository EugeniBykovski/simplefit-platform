import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Canonical className composer: conditional classes via clsx, then Tailwind
 * conflict resolution via tailwind-merge (later classes win).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a route segment is a UUID. Ids from the URL (e.g. `gymId`) are
 * checked before they are placed in an API path, so a crafted segment
 * (`..`, an encoded slash) can never steer a request to another endpoint
 * (SF-104). The backend still authorizes every id.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
