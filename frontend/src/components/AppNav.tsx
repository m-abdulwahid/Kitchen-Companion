"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ASSISTANT, PROJECT } from "@/lib/assistant";

const courses = [
  {
    href: "/",
    course: "Main Course",
    label: "Explore",
    note: "Browse today's specials",
    icon: ExploreIcon,
  },
  {
    href: "/cookbook",
    course: "Sides",
    label: "Your Cookbook",
    note: "Dishes you already love",
    icon: CookbookIcon,
  },
  {
    href: "/upload",
    course: "Chef's Specials",
    label: "Upload",
    note: "A recipe from a video",
    icon: UploadIcon,
  },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-espresso/40 md:hidden"
        />
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 flex">
        <div className="flex w-[4.25rem] flex-col items-center border-r border-peach/80 bg-cream/95 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Collapse menu" : "Expand menu"}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-espresso shadow-sm ring-1 ring-peach/80 hover:bg-peach"
          >
            <MenuIcon />
          </button>

          <nav className="mt-4 flex flex-col items-center gap-2">
            {courses.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={`grid h-10 w-10 place-items-center rounded-2xl ${
                    active
                      ? "bg-espresso text-cream"
                      : "bg-white text-cocoa ring-1 ring-peach/80 hover:bg-peach"
                  }`}
                >
                  <Icon />
                </Link>
              );
            })}
          </nav>
        </div>

        <div
          className={`menu-paper h-full overflow-y-auto border-r border-peach bg-[#fffaf2] shadow-[8px_0_28px_rgba(61,36,24,0.12)] transition-[width] duration-200 ${
            open ? "w-[20.5rem] px-5 py-5" : "w-0 overflow-hidden px-0 py-0"
          }`}
        >
          <div className={open ? "w-[18rem]" : "hidden"}>
            <div className="text-center">
              <div className="mx-auto w-fit">
                <BrandMark
                  src="/brand/whisk-ella-logo.png"
                  alt="Whiskers logo"
                  className="h-14 w-14"
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
                today&apos;s menu
              </p>
            </div>

            <nav className="mt-6 space-y-4">
              {courses.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={`${item.href}-full`}
                    href={item.href}
                    className={`block rounded-2xl border border-dashed border-caramel/30 px-4 py-3 ${
                      active ? "bg-peach/70" : "bg-white/50 hover:bg-peach/40"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-caramel">
                      {item.course}
                    </p>
                    <div className="mt-1 border-b border-dotted border-caramel/50 pb-1">
                      <span className="font-display text-2xl text-espresso">
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-cocoa/75">{item.note}</p>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      <div
        className={`shrink-0 transition-[width] duration-200 ${
          open ? "w-[4.25rem] md:w-[calc(4.25rem+20.5rem)]" : "w-[4.25rem]"
        }`}
      />
    </>
  );
}

function MenuIcon() {
  return (
    <span className="flex flex-col gap-1">
      <span className="block h-0.5 w-4 rounded-full bg-current" />
      <span className="block h-0.5 w-4 rounded-full bg-current" />
      <span className="block h-0.5 w-3 rounded-full bg-current" />
    </span>
  );
}

function ExploreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CookbookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M6 4.8h11.2A1.8 1.8 0 0 1 19 6.6v12.1H7.6A1.6 1.6 0 0 0 6 20.3V4.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M6 20.3A1.6 1.6 0 0 1 7.6 18.7H19" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 8h7M9 11.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12 16V7m0 0-3.2 3.2M12 7l3.2 3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
