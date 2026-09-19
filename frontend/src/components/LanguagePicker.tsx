"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES } from "@/lib/languages";

/** Choose the language the companion speaks. Text is translated by the voice service. */
export function LanguagePicker() {
  const { language, setLanguage } = useLanguage();

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
