"use client";

import { useEffect, useRef, useState } from "react";
import { Pip } from "@/components/Pip";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useCompanion } from "@/hooks/useCompanion";
import { useLanguage } from "@/hooks/useLanguage";
import { useVoiceAssistant, type VoiceState } from "@/hooks/useVoiceAssistant";
import { checkStepWithVision } from "@/lib/mocks";
import type { Recipe } from "@/lib/types";

type CookingViewProps = {
  recipe: Recipe;
  onExit: () => void;
};

function askLabels(name: string): Record<VoiceState, string> {
  return {
    idle: `Ask ${name}`,
    recording: "Listening… tap to send",
    thinking: `${name} is thinking…`,
    speaking: `${name} is talking — tap to interrupt`,
  };
}

type PipMood = "idle" | "talk" | "listen" | "cheer";

export function CookingView({ recipe, onExit }: CookingViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Camera warming up…");
  const [checking, setChecking] = useState(false);
  // A mood belongs to the step it was set on, so it falls back to idle when the step changes.
  const [moodState, setMoodState] = useState<{ mood: PipMood; stepIndex: number }>(
    { mood: "idle", stepIndex: 0 },
  );
  const pipMood = moodState.stepIndex === stepIndex ? moodState.mood : "idle";
  const setPipMood = (mood: PipMood) => setMoodState({ mood, stepIndex });
  // The companion picked on the recipe page: their voice, name and personality.
  const { companion } = useCompanion();
  const { language } = useLanguage();
  // All of the companion's talking, and the user's questions, go through the voice service (Omni).
  const {
    state: voiceState,
    toggle: toggleVoice,
    speak,
  } = useVoiceAssistant({
    onReply: setStatus,
    onError: setStatus,
    onSpoken: setStatus,
    companion: {
      voice: companion.voice,
      name: companion.name,
      style: companion.style,
      language: language.code,
    },
  });
  const shownMood =
    voiceState === "recording"
      ? "listen"
      : voiceState === "speaking"
        ? "talk"
        : pipMood;

  const step = recipe.steps[stepIndex];
  // One string for the auto-read and "Repeat aloud", so a repeat is served from the voice service's cache.
  const stepSpeech = `Step ${stepIndex + 1}. ${step}`;
  // The next step, so its audio is ready before the user gets there.
  const upcomingSpeech =
    stepIndex + 1 < recipe.steps.length
      ? `Step ${stepIndex + 2}. ${recipe.steps[stepIndex + 1]}`
      : undefined;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
        setStatus("Live camera on. Let’s cook.");
      })
      .catch(() => {
        setStatus("Camera blocked — allow the webcam so your chef can watch the pan.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Pip's "talk" mood while speaking comes from the voice state (shownMood above).
  // Also re-reads the step when the language changes, so switching language is heard at once.
  useEffect(() => {
    speak(stepSpeech, upcomingSpeech);
  }, [stepSpeech, upcomingSpeech, speak, language.code]);

  async function captureAndCheck() {
    const video = videoRef.current;
    if (!video) return;
    setChecking(true);
    setPipMood("talk");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const result = await checkStepWithVision(
      imageDataUrl,
      step,
      stepIndex,
      companion.name,
    );
    setStatus(result.feedback);
    speak(result.feedback);
    setChecking(false);
    setPipMood(result.passed ? "cheer" : "idle");
  }

  function nextStep() {
    if (stepIndex >= recipe.steps.length - 1) {
      speak(`That’s the last step. ${recipe.title} is done. You crushed it.`);
      setStatus("Last step — plate it cute.");
      setPipMood("cheer");
      return;
    }
    setStepIndex((value) => value + 1);
  }

  function prevStep() {
    setStepIndex((value) => Math.max(0, value - 1));
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="overflow-hidden rounded-[2rem] bg-espresso shadow-[0_16px_40px_rgba(61,36,24,0.25)]">
        <div className="flex items-center justify-between px-5 py-3 text-cream">
          <p className="font-display text-lg">Live cook · {recipe.title}</p>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Exit
          </button>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full bg-black object-cover"
        />
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-[2rem] bg-white p-5 shadow-[0_12px_32px_rgba(107,63,42,0.1)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-caramel">
            Step {stepIndex + 1} of {recipe.steps.length}
          </p>
          <p className="mt-2 font-display text-2xl leading-8 text-espresso">{step}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={prevStep}
              className="rounded-2xl bg-cream py-3 font-semibold text-cocoa"
            >
              Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="rounded-2xl bg-tomato py-3 font-semibold text-cream"
            >
              Next step
            </button>
            <button
              type="button"
              onClick={() => speak(stepSpeech)}
              className="rounded-2xl bg-peach py-3 font-semibold text-cocoa"
            >
              Repeat aloud
            </button>
            <button
              type="button"
              disabled={checking}
              onClick={captureAndCheck}
              className="rounded-2xl bg-raspberry py-3 font-semibold text-cream disabled:opacity-60"
            >
              {checking ? `${companion.name} is looking…` : "Check my step"}
            </button>
            <button
              type="button"
              disabled={voiceState === "thinking"}
              onClick={() => toggleVoice(step)}
              className="col-span-2 rounded-2xl border-2 border-tomato py-3 font-semibold text-tomato disabled:opacity-60"
            >
              {askLabels(companion.name)[voiceState]}
            </button>
          </div>
          <div className="mt-4">
            <LanguagePicker />
          </div>
        </div>
        <Pip mood={shownMood} message={status} />
      </div>
    </section>
  );
}
