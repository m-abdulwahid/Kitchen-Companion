"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES } from "@/lib/languages";

type LanguagePickerProps = {
  compact?: boolean;
};

/** Choose the language Remy speaks. */
export function LanguagePicker({ compact = false }: LanguagePickerProps) {
  const { language, setLanguage } = useLanguage();

  if (compact) {
    return (
      <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-caramel">
        Lang
        <select
          value={language.code}
          onChange={(event) => setLanguage(event.target.value)}
          className="rounded-full border border-peach bg-white px-1.5 py-0.5 text-xs font-semibold normal-case text-cocoa"
        >
          {LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id="language-label" className="text-sm font-semibold text-cocoa">
        Language
      </span>
      <div
        role="radiogroup"
        aria-labelledby="language-label"
        className="flex gap-1 rounded-full bg-peach/70 p-1"
      >
        {LANGUAGES.map((item) => {
          const selected = item.code === language.code;
          return (
            <button
              key={item.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setLanguage(item.code)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                selected ? "bg-tomato text-cream" : "text-cocoa hover:bg-white/70"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
