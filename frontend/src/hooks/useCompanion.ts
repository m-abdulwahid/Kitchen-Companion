"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_COMPANION, getCompanion } from "@/lib/companions";
import {
  getCompanionIdSnapshot,
  setCompanionId,
  subscribeCompanion,
} from "@/lib/companion-store";

/** The cooking companion the user picked (default: the first in COMPANIONS). */
export function useCompanion() {
  // The server render, and hydration, use the default; the browser then switches to the saved choice.
  const id = useSyncExternalStore(
    subscribeCompanion,
    getCompanionIdSnapshot,
    () => DEFAULT_COMPANION.id,
  );
  return { companion: getCompanion(id), setCompanion: setCompanionId };
}
