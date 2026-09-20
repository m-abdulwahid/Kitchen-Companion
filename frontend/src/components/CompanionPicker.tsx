"use client";

import { useEffect, useRef, useState } from "react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useCompanion } from "@/hooks/useCompanion";
import { useLanguage } from "@/hooks/useLanguage";
import { ASSISTANT } from "@/lib/assistant";
import { COMPANIONS, type Companion } from "@/lib/companions";
import { speakText } from "@/lib/voice-api";

type Phase = { id: string; step: "loading" | "playing" } | null;

export function CompanionPicker() {
  const { companion, setCompanion } = useCompanion();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function stop() {
    abortRef.current?.abort();
    audioRef.current?.pause();
    audioRef.current = null;
    setPhase(null);
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
    };
  }, []);

  async function listen(candidate: Companion) {
    if (phase?.id === candidate.id) {
      stop();
      return;
    }
    stop();
    setError("");
    setPhase({ id: candidate.id, step: "loading" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await speakText(
        `Hi, I'm ${ASSISTANT.name}. Let's whisk something up.`,
        candidate.voice,
        language.code,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!reply.audio) throw new Error("no audio");
      const player = new Audio(
        `data:${reply.audioMime ?? "audio/wav"};base64,${reply.audio}`,
      );
      audioRef.current = player;
      player.onended = () => setPhase(null);
      setPhase({ id: candidate.id, step: "playing" });
      await player.play();
    } catch {
      if (controller.signal.aborted) return;
      setPhase(null);
      setError("That voice is camera-shy. Try again in a beat.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl bg-cream px-3 py-2 text-left text-xs font-semibold text-cocoa hover:bg-peach"
      >
        <span>📁 Voice options · {companion.label}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-peach bg-white p-2">
          {COMPANIONS.map((item) => {
            const selected = item.id === companion.id;
            const active = phase?.id === item.id;
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                  selected ? "bg-peach/80" : "hover:bg-cream"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCompanion(item.id)}
                  className="flex-1 text-left text-xs font-semibold text-espresso"
                >
                  {item.label}
                  <span className="block text-[10px] font-normal text-caramel">
                    {item.blurb}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => listen(item)}
                  aria-label={`Preview ${item.label}`}
                  className="rounded-full px-2 text-[10px] font-semibold text-caramel hover:bg-peach"
                >
                  {active ? (phase?.step === "loading" ? "…" : "■") : "▶"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <LanguagePicker compact />
      {error ? (
        <p role="alert" className="text-xs text-raspberry">
          {error}
        </p>
      ) : null}
    </div>
  );
}
