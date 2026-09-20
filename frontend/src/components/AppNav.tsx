"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const items = [
  { href: "/", label: "Explore", icon: ExploreIcon },
  { href: "/cookbook", label: "Cookbook", icon: CookbookIcon },
  { href: "/upload", label: "Upload", icon: UploadIcon },
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

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-peach/80 bg-cream/95 py-3 backdrop-blur transition-[width] duration-200 ${
          open ? "w-52 px-3" : "w-[4.25rem] items-center px-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Collapse menu" : "Expand menu"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-espresso shadow-sm ring-1 ring-peach/80 hover:bg-peach"
        >
          <MenuIcon />
        </button>
        <nav className={`mt-4 flex flex-col gap-2 ${open ? "w-full" : "items-center"}`}>
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`flex h-10 items-center overflow-hidden rounded-2xl ${
                  open ? "w-full gap-3 px-1.5" : "w-10 justify-center"
                } ${
                  active
                    ? "bg-espresso text-cream"
                    : "bg-white text-cocoa ring-1 ring-peach/80 hover:bg-peach"
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center">
                  <Icon />
                </span>
                <span
                  className={`whitespace-nowrap text-sm font-semibold transition-opacity duration-200 ${
                    open ? "opacity-100" : "sr-only"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div
        className={`shrink-0 transition-[width] duration-200 ${
          open ? "w-52" : "w-[4.25rem]"
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
