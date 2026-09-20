"use client";

import { useEffect, useRef, useState } from "react";
import { CompanionPicker } from "@/components/CompanionPicker";

type RecipeOverflowMenuProps = {
  saved: boolean;
  copied: boolean;
  onSave: () => void;
  onShare: () => void;
};

export function RecipeOverflowMenu({
  saved,
  copied,
  onSave,
  onShare,
}: RecipeOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
      <button
        type="button"
        onClick={onSave}
        aria-label={saved ? "Remove from cookbook" : "Save to cookbook"}
        title={saved ? "Saved in Your Cookbook" : "Save to Your Cookbook"}
        className={`grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-peach/80 hover:bg-peach ${
          saved ? "text-raspberry" : "text-cocoa"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v16.2l-6-3.4-6 3.4V4.5Z"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More recipe options"
          onClick={() => setOpen((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-cocoa shadow-sm ring-1 ring-peach/80 hover:bg-peach"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <circle cx="12" cy="6" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="18" r="1.6" fill="currentColor" />
          </svg>
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 overflow-visible rounded-2xl bg-white py-2 text-sm shadow-[0_12px_32px_rgba(107,63,42,0.16)] ring-1 ring-peach/70"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onShare();
              }}
              className="block w-full px-4 py-2.5 text-left font-semibold text-cocoa hover:bg-cream"
            >
              {copied ? "Copied" : "🔗 Share"}
            </button>
            <div className="mx-3 my-2 border-t border-peach/70" />
            <div className="px-3 pb-2">
              <CompanionPicker />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
