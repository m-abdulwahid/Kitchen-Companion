"use client";

import { useCompanion } from "@/hooks/useCompanion";

type RemyMood = "idle" | "talk" | "listen" | "cheer";

type RemyProps = {
  mood?: RemyMood;
  message?: string;
  size?: "sm" | "md";
};

export function Remy({ mood = "idle", message, size = "md" }: RemyProps) {
  const { companion } = useCompanion();
  const bounce =
    mood === "talk" || mood === "cheer" ? "animate-bounce" : "animate-pip";
  const box = size === "sm" ? "h-16 w-14" : "h-24 w-20";

  return (
    <div className="flex items-end gap-3">
      <div className={`relative shrink-0 ${box} ${bounce}`} aria-hidden="true">
        <svg viewBox="0 0 100 120" className="h-full w-full drop-shadow-sm">
          <ellipse cx="48" cy="112" rx="22" ry="5" fill="#e8c9b0" />
          <path
            d="M78 78c10 14 16 24 12 30"
            fill="none"
            stroke="#7a4a32"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse cx="48" cy="78" rx="22" ry="26" fill="#8b5a3c" />
          <ellipse cx="48" cy="84" rx="14" ry="16" fill="#d4a574" />
          <circle cx="48" cy="48" r="22" fill="#8b5a3c" />
          <ellipse cx="28" cy="36" rx="10" ry="12" fill="#8b5a3c" />
          <ellipse cx="68" cy="36" rx="10" ry="12" fill="#8b5a3c" />
          <ellipse cx="28" cy="37" rx="6" ry="7" fill="#f4b6c8" />
          <ellipse cx="68" cy="37" rx="6" ry="7" fill="#f4b6c8" />
          <ellipse cx="48" cy="56" rx="9" ry="7" fill="#d4a574" />
          <ellipse cx="48" cy="58" rx="4.5" ry="3.2" fill="#e07a8a" />
          <path d="M18 54h12" stroke="#3d2418" strokeWidth="1.2" />
          <path d="M20 58h11" stroke="#3d2418" strokeWidth="1.2" />
          <path d="M19 62h10" stroke="#3d2418" strokeWidth="1.2" />
          <path d="M66 54h12" stroke="#3d2418" strokeWidth="1.2" />
          <path d="M67 58h11" stroke="#3d2418" strokeWidth="1.2" />
          <path d="M68 62h10" stroke="#3d2418" strokeWidth="1.2" />
          <circle cx="40" cy="48" r="3.4" fill="#3d2418" />
          <circle cx="56" cy="48" r="3.4" fill="#3d2418" />
          <circle cx="41.2" cy="47" r="1.1" fill="#fff6ec" />
          <circle cx="57.2" cy="47" r="1.1" fill="#fff6ec" />
          <path
            d="M22 18h52l-7 18H29L22 18z"
            fill="#fff6ec"
            stroke="#e85d4c"
            strokeWidth="2"
          />
          <circle cx="48" cy="16" r="6" fill="#ff7a59" />
          <path
            d="M70 86l18 4-18 4 3-4-3-4z"
            fill="#c4784a"
            stroke="#6b3f2a"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M88 90h10" stroke="#6b3f2a" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="90" r="3.4" fill="#c4784a" stroke="#6b3f2a" strokeWidth="1.2" />
          <path
            d="M26 92c8 10 16 10 24 2"
            fill="none"
            stroke="#6b3f2a"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {message ? (
        <div className="relative max-w-sm rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-cocoa shadow-[0_8px_24px_rgba(107,63,42,0.12)]">
          <p className="font-display text-raspberry">{companion.name}</p>
          <p>{message}</p>
        </div>
      ) : null}
    </div>
  );
}
