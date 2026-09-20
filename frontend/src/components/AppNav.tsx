"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandMark } from "@/components/BrandMark";
import { ASSISTANT, PROJECT } from "@/lib/assistant";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const menu = open ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-espresso/50"
      />
      <aside className="menu-paper relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-peach bg-[#fffaf2] px-6 py-6 shadow-[0_24px_60px_rgba(61,36,24,0.28)]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-caramel"
        >
          Close
        </button>
        <div className="text-center">
          <div className="mx-auto w-fit">
            <BrandMark
              src="/brand/whisk-ella-logo.png"
              alt="Whiskers logo"
              className="h-16 w-16"
            />
          </div>
          <p className="mt-2 font-display text-3xl text-espresso">{PROJECT.name}</p>
          <svg viewBox="0 0 260 56" className="mx-auto h-12 w-56">
            <path id="whisk-arc" d="M18 48 Q130 0 242 48" fill="none" />
            <text
              fill="#c4784a"
              fontFamily="var(--font-fredoka), Fredoka, sans-serif"
              fontSize="22"
            >
              <textPath href="#whisk-arc" startOffset="50%" textAnchor="middle">
                with {ASSISTANT.brand}
              </textPath>
            </text>
          </svg>
          <p className="font-display text-sm tracking-[0.35em] text-caramel uppercase">
            tonight&apos;s menu
          </p>
        </div>

        <nav className="mt-6 space-y-4">
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
      </aside>
    </div>
  ) : null;

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
        <BrandMark
          src="/brand/whisk-ella-logo.png"
          alt="Whiskers logo"
          className="h-10 w-10"
        />
        <Link href="/" className="font-display text-xl text-espresso">
          {PROJECT.name}
        </Link>
      </div>
      {mounted ? createPortal(menu, document.body) : null}
    </header>
  );
}
