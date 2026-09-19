"use client";

import { useEffect, useRef, useState } from "react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Remy } from "@/components/Remy";
import { useCompanion } from "@/hooks/useCompanion";
import { useLanguage } from "@/hooks/useLanguage";
import { useVoiceAssistant, type VoiceState } from "@/hooks/useVoiceAssistant";
import { describeCameraError, requestCamera } from "@/lib/camera-error";
import type { Recipe } from "@/lib/types";
import { checkStepWithVision } from "@/lib/voice-api";

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

type RemyMood = "idle" | "talk" | "listen" | "cheer";

export function CookingView({ recipe, onExit }: CookingViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Camera warming up…");
  const [checking, setChecking] = useState(false);
  const [cameraProblem, setCameraProblem] = useState("");
  const [cameraTry, setCameraTry] = useState(0);
  const [moodState, setMoodState] = useState<{ mood: RemyMood; stepIndex: number }>(
    { mood: "idle", stepIndex: 0 },
  );
  const remyMood = moodState.stepIndex === stepIndex ? moodState.mood : "idle";
  const setRemyMood = (mood: RemyMood) => setMoodState({ mood, stepIndex });
  const { companion } = useCompanion();
  const { language } = useLanguage();
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
        : remyMood;

  const step = recipe.steps[stepIndex];
  const stepSpeech = `Step ${stepIndex + 1}. ${step}`;
  const upcomingSpeech =
    stepIndex + 1 < recipe.steps.length
      ? `Step ${stepIndex + 2}. ${recipe.steps[stepIndex + 1]}`
      : undefined;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;

    requestCamera()
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
        setCameraProblem("");
        setStatus("Live camera on. Talk to Remy whenever you need him.");
      })
      .catch((error) => {
        if (cancelled) return;
        // say what actually went wrong: a blocked permission, a busy camera and a missing one need different fixes
        setCameraProblem(describeCameraError(error));
        setStatus("Remy can't see the pan yet. Fix the camera and press Try again.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraTry]);

  useEffect(() => {
    speak(stepSpeech, upcomingSpeech);
  }, [stepSpeech, upcomingSpeech, speak, language.code]);

  async function captureAndCheck() {
    const video = videoRef.current;
    if (!video) return;
    setChecking(true);
    setRemyMood("talk");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    try {
      const result = await checkStepWithVision(imageDataUrl, step, {
        name: companion.name,
        style: companion.style,
      });
      setStatus(result.feedback);
      speak(result.feedback);
      setRemyMood(result.passed ? "cheer" : "idle");
    } catch {
      setStatus(`${companion.name} couldn’t check that step. Is the voice service running?`);
      setRemyMood("idle");
    } finally {
      setChecking(false);
    }
  }

  function nextStep() {
    if (stepIndex >= recipe.steps.length - 1) {
      speak(`That’s the last step. ${recipe.title} is done. You crushed it.`);
      setStatus("Last step — plate it cute.");
      setRemyMood("cheer");
      return;
    }
    setStepIndex((value) => value + 1);
  }

  function prevStep() {
    setStepIndex((value) => Math.max(0, value - 1));
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.7fr)]">
      <div className="overflow-hidden rounded-[2rem] bg-espresso shadow-[0_16px_40px_rgba(61,36,24,0.25)]">
        <div className="flex items-center justify-between px-5 py-2.5 text-cream">
          <p className="font-display text-lg">Live cook · {recipe.title}</p>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Exit
          </button>
        </div>
        {cameraProblem ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 bg-raspberry/90 px-5 py-3 text-sm text-cream"
          >
            <span className="max-w-xl">{cameraProblem}</span>
            <button
              type="button"
              onClick={() => {
                setCameraProblem("");
                setStatus("Camera warming up…");
                setCameraTry((count) => count + 1);
              }}
              className="rounded-full bg-cream px-4 py-1.5 font-semibold text-raspberry"
            >
              Try again
            </button>
          </div>
        ) : null}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full bg-black object-cover lg:aspect-[16/10]"
        />
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_12px_32px_rgba(107,63,42,0.1)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-caramel">
              Step {stepIndex + 1} of {recipe.steps.length}
            </p>
            <LanguagePicker compact />
          </div>
          <p className="mt-2 font-display text-xl leading-7 text-espresso">{step}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={prevStep}
              className="rounded-2xl bg-cream py-2.5 text-sm font-semibold text-cocoa"
            >
              Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="rounded-2xl bg-tomato py-2.5 text-sm font-semibold text-cream"
            >
              Next step
            </button>
            <button
              type="button"
              onClick={() => speak(stepSpeech)}
              className="rounded-2xl bg-peach py-2.5 text-sm font-semibold text-cocoa"
            >
              Repeat
            </button>
            <button
              type="button"
              disabled={checking}
              onClick={captureAndCheck}
              className="rounded-2xl bg-raspberry py-2.5 text-sm font-semibold text-cream disabled:opacity-60"
            >
              {checking ? "Looking…" : "Check step"}
            </button>
            <button
              type="button"
              disabled={voiceState === "thinking"}
              onClick={() => toggleVoice(step)}
              className="col-span-2 rounded-2xl bg-tomato py-3.5 font-display text-lg text-cream shadow disabled:opacity-60"
            >
              {askLabels(companion.name)[voiceState]}
            </button>
          </div>
        </div>
        <Remy size="sm" mood={shownMood} message={status} />
      </div>
    </section>
  );
}
