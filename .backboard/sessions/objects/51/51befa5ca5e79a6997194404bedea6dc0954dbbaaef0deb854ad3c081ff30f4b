"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, getLanguage } from "@/lib/languages";
import {
  getLanguageCodeSnapshot,
  setLanguageCode,
  subscribeLanguage,
} from "@/lib/language-store";

/** The language the companion speaks (default English). Remembered in the browser. */
export function useLanguage() {
  // The server render, and hydration, use the default; the browser then switches to the saved choice.
  const code = useSyncExternalStore(
    subscribeLanguage,
    getLanguageCodeSnapshot,
    () => DEFAULT_LANGUAGE.code,
  );
  return { language: getLanguage(code), setLanguage: setLanguageCode };
}
