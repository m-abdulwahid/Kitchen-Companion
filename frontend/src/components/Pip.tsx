import { ASSISTANT } from "@/lib/assistant";

type PipProps = {
  mood?: "idle" | "talk" | "listen" | "cheer";
  message?: string;
};

export function Pip({ mood = "idle", message }: PipProps) {
  const bounce =
    mood === "talk" || mood === "cheer" ? "animate-bounce" : "animate-pip";

  return (
    <div className="flex items-end gap-3">
      <div className={`relative h-20 w-16 shrink-0 ${bounce}`}>
        <svg viewBox="0 0 80 100" className="h-full w-full drop-shadow-sm">
          <ellipse cx="40" cy="92" rx="18" ry="5" fill="#e8c9b0" />
          <path
            d="M18 38c0-16 12-30 22-30s22 14 22 30v28c0 10-8 20-22 20S18 76 18 66V38z"
            fill="#c4784a"
          />
          <ellipse cx="28" cy="18" rx="10" ry="12" fill="#e8a078" />
          <ellipse cx="52" cy="18" rx="10" ry="12" fill="#e8a078" />
          <ellipse cx="28" cy="19" rx="6" ry="7" fill="#f7a1b5" />
          <ellipse cx="52" cy="19" rx="6" ry="7" fill="#f7a1b5" />
          <circle cx="32" cy="48" r="3.2" fill="#3d2418" />
          <circle cx="48" cy="48" r="3.2" fill="#3d2418" />
          <circle cx="33.2" cy="47" r="1" fill="#fff6ec" />
          <circle cx="49.2" cy="47" r="1" fill="#fff6ec" />
          <ellipse cx="40" cy="56" rx="5" ry="3.4" fill="#e04f6d" />
          <path
            d="M34 62c4 4 8 4 12 0"
            fill="none"
            stroke="#6b3f2a"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M22 8h36l-6 16H28L22 8z"
            fill="#fff6ec"
            stroke="#e85d4c"
            strokeWidth="2"
          />
          <circle cx="40" cy="6" r="5" fill="#ff7a59" />
          <path
            d="M8 70c10-8 14-4 16 6"
            fill="none"
            stroke="#c4784a"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {message ? (
        <div className="relative max-w-sm rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-cocoa shadow-[0_8px_24px_rgba(107,63,42,0.12)]">
          <p className="font-display text-raspberry">{ASSISTANT.name}</p>
          <p>{message}</p>
        </div>
      ) : null}
    </div>
  );
}
