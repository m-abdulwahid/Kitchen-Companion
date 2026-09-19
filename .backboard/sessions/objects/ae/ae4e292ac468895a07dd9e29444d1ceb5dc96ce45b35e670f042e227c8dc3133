/**
 * Languages the companion can speak. `code` must match LANGUAGES in voice/app.py, which does
 * the translating. The voices support 29 languages (see voice/voices.json), so to add one,
 * add a line here and in that file. English is the source language and is never translated.
 */
export type Language = { code: string; label: string };

export const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0];

export function getLanguage(code: string | null | undefined): Language {
  return LANGUAGES.find((language) => language.code === code) ?? DEFAULT_LANGUAGE;
}
