"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCompanion } from "@/hooks/useCompanion";

const links = [
  { href: "/", label: "Explore" },
  { href: "/cookbook", label: "My cookbook" },
  { href: "/upload", label: "Upload" },
];

export function AppNav() {
  const pathname = usePathname();
  const { companion } = useCompanion();

  return (
    <header className="sticky top-0 z-20 border-b border-peach/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-tomato text-lg shadow-sm">
            🍅
          </span>
          <div>
            <p className="font-display text-xl text-espresso">Kitchen Companion</p>
            <p className="text-xs text-caramel">
              cook with {companion.name} · live · loud · a little messy
            </p>
          </div>
        </Link>
        <nav className="flex gap-1 rounded-full bg-peach/70 p-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-tomato text-cream shadow"
                    : "text-cocoa hover:bg-white/70"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
