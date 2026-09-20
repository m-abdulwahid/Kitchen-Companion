"use client";

import { ASSISTANT } from "@/lib/assistant";

type EllaMood = "idle" | "talk" | "listen" | "cheer";

type EllaProps = {
  mood?: EllaMood;
  message?: string;
  size?: "sm" | "md";
};

export function Ella({ mood = "idle", message, size = "md" }: EllaProps) {
  const bounce =
    mood === "talk" || mood === "cheer" ? "animate-bounce" : "animate-pip";
  const box = size === "sm" ? "h-16 w-16" : "h-24 w-24";

  return (
    <div className="flex items-end gap-3">
      <img
        src="/brand/whisk-ella-avatar.png"
        alt=""
        className={`relative shrink-0 ${box} rounded-full bg-white object-cover shadow-[0_8px_18px_rgba(107,63,42,0.16)] ring-2 ring-peach ${bounce}`}
      />
      {message ? (
        <div className="relative max-w-sm rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-cocoa shadow-[0_8px_24px_rgba(107,63,42,0.12)]">
          <p className="font-display text-raspberry">{ASSISTANT.name}</p>
          <p>{message}</p>
        </div>
      ) : null}
    </div>
  );
}

export const Remy = Ella;
