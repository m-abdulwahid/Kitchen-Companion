"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type FilterDropdownProps = {
  label: string;
  summary: string;
  children: ReactNode;
};

export function FilterDropdown({ label, summary, children }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-[12rem] flex-1">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-caramel">
        {label}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-2xl border border-peach bg-cream px-3 py-2.5 text-left text-sm font-semibold text-espresso hover:bg-peach/50"
      >
        <span className="truncate">{summary}</span>
        <span className="ml-2 text-caramel">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute z-20 mt-2 w-full rounded-2xl border border-peach bg-white p-2 shadow-[0_12px_28px_rgba(61,36,24,0.12)]"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
