"use client";

import { useEffect, useRef, useState } from "react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useCompanion } from "@/hooks/useCompanion";
import { useLanguage } from "@/hooks/useLanguage";
import { COMPANIONS, type Companion } from "@/lib/companions";
import { speakText } from "@/lib/voice-api";

type Phase = { id: string; step: "loading" | "playing" } | null;

/** Pick who to cook with. Each card has a "Listen" button that plays that voice. */
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
        `Hi, I'm ${candidate.name}. Let's cook something good!`,
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
      setError("Couldn't play that voice. Is the voice service running?");
    }
  }

  return (
    <fieldset className="mt-6">
      <legend className="font-display text-xl text-espresso">
        Who’s cooking with you?
      </legend>
      <div
        role="radiogroup"
        aria-label="Cooking companion"
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        {COMPANIONS.map((item) => {
          const selected = item.id === companion.id;
          const active = phase?.id === item.id;
          return (
            <div
              key={item.id}
              className={`flex items-stretch overflow-hidden rounded-2xl border-2 ${
                selected ? "border-tomato bg-white" : "border-peach bg-cream"
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCompanion(item.id)}
                className="flex-1 px-3 py-2 text-left"
              >
                <span className="flex items-center gap-2 font-display text-lg text-espresso">
                  {item.name}
                  {selected ? (
                    <span className="rounded-full bg-tomato px-2 py-0.5 text-xs font-semibold text-cream">
                      cooking with
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm leading-5 text-cocoa/80">
                  {item.blurb}
                </span>
              </button>
              <button
                type="button"
                onClick={() => listen(item)}
                aria-label={`Listen to ${item.name}`}
                className="w-24 shrink-0 border-l border-peach px-2 text-sm font-semibold text-caramel hover:bg-peach hover:text-tomato"
              >
                {active
                  ? phase?.step === "loading"
                    ? "Loading…"
                    : "■ Stop"
                  : "▶ Listen"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <LanguagePicker />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-raspberry">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
