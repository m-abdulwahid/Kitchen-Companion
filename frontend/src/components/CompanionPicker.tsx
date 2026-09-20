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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-caramel">
        Ella&apos;s voice
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {COMPANIONS.map((item) => {
          const selected = item.id === companion.id;
          const active = phase?.id === item.id;
          return (
            <div key={item.id} className="flex overflow-hidden rounded-full border border-peach">
              <button
                type="button"
                onClick={() => setCompanion(item.id)}
                className={`px-2.5 py-0.5 text-xs font-semibold ${
                  selected ? "bg-tomato text-cream" : "bg-cream text-cocoa hover:bg-peach"
                }`}
              >
                {item.label}
              </button>
              <button
                type="button"
                onClick={() => listen(item)}
                aria-label={`Preview ${item.label} voice`}
                className="border-l border-peach bg-white px-1.5 text-[10px] font-semibold text-caramel hover:bg-peach"
              >
                {active ? (phase?.step === "loading" ? "…" : "■") : "▶"}
              </button>
            </div>
          );
        })}
      </div>
      <LanguagePicker compact />
      {error ? (
        <p role="alert" className="text-xs text-raspberry">
          {error}
        </p>
      ) : null}
    </div>
  );
}
