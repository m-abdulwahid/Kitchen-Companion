"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ASSISTANT } from "@/lib/assistant";

const courses = [
  {
    href: "/",
    course: "Main Course",
    label: "Explore",
    note: "Browse tonight's specials",
  },
  {
    href: "/cookbook",
    course: "Sides",
    label: "Your Cookbook",
    note: "Dishes you already love",
  },
  {
    href: "/upload",
    course: "Chef's Specials",
    label: "Upload",
    note: "A recipe from a video",
  },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-peach/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-espresso shadow-sm ring-1 ring-peach/80 hover:bg-peach"
        >
          <span className="flex flex-col gap-1">
            <span className="block h-0.5 w-4 rounded-full bg-espresso" />
            <span className="block h-0.5 w-4 rounded-full bg-espresso" />
            <span className="block h-0.5 w-3 rounded-full bg-espresso" />
          </span>
        </button>
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/brand/whisk-ella-logo.png"
            alt="Whisk-Ella"
            className="h-10 w-10 object-contain"
          />
          <p className="font-display text-xl text-espresso">{ASSISTANT.brand}</p>
        </Link>
      </div>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-espresso/35"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(22rem,92vw)] transform overflow-y-auto border-r border-peach bg-[#fffaf2] shadow-[12px_0_40px_rgba(61,36,24,0.18)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="menu-paper px-5 pb-8 pt-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-caramel"
          >
            Close
          </button>
          <div className="text-center">
            <img
              src="/brand/whisk-ella-logo.png"
              alt="Whisk-Ella"
              className="mx-auto h-16 w-16 object-contain"
            />
            <svg viewBox="0 0 260 72" className="mx-auto mt-1 h-16 w-56">
              <path
                id="whisk-arc"
                d="M18 58 Q130 -6 242 58"
                fill="none"
              />
              <text
                fill="#3d2418"
                fontFamily="var(--font-fredoka), Fredoka, sans-serif"
                fontSize="28"
              >
                <textPath href="#whisk-arc" startOffset="50%" textAnchor="middle">
                  Whisk-Ella
                </textPath>
              </text>
            </svg>
            <p className="font-display text-sm tracking-[0.35em] text-caramel uppercase">
              tonight&apos;s menu
            </p>
          </div>

          <nav className="mt-8 space-y-5">
            {courses.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-2xl border border-dashed border-caramel/30 px-4 py-3 ${
                    active ? "bg-peach/70" : "bg-white/50 hover:bg-peach/40"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-caramel">
                    {item.course}
                  </p>
                  <div className="mt-1 flex items-baseline justify-between gap-3 border-b border-dotted border-caramel/50 pb-1">
                    <span className="font-display text-2xl text-espresso">
                      {item.label}
                    </span>
                    <span className="text-xs text-caramel">• • •</span>
                  </div>
                  <p className="mt-1 text-sm text-cocoa/75">{item.note}</p>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </header>
  );
}
