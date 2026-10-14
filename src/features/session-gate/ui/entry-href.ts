"use client";

/*
 * The entry helpers client widgets need (WCX1, SF-54), re-exported from a
 * client module: `model/entry` reads the session, which a Server Component
 * importing the slice must never load.
 */
export { entryHref, isKnownEntry } from "../model/entry";
