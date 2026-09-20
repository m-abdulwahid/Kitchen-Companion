"use client";

import { useEffect, useRef, useState } from "react";
import { Ella } from "@/components/Ella";
import { useCompanion } from "@/hooks/useCompanion";
import { useCookingAgent } from "@/hooks/useCookingAgent";
import { useLanguage } from "@/hooks/useLanguage";
import { useLiveSession } from "@/hooks/useLiveSession";
import { describeCameraError, requestCamera } from "@/lib/camera-error";
import { checkCookingFrame, type CookingAgentDecision } from "@/lib/cooking-agent-api";
import { captureCameraFrame, type CameraFrame } from "@/lib/camera-frame";
import { cookingMemoryProfileId } from "@/lib/cooking-profile";
import type { Recipe } from "@/lib/types";

type CookingViewProps = {
  recipe: Recipe;
  onExit: () => void;
};

type EllaMood = "idle" | "talk" | "listen" | "cheer";
type CameraSeed = { frame: CameraFrame; sessionId: string };

function newCookingSessionId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function openingGreeting(observation: string): string {
  return `I can see ${observation}. Let me know if you want help with what to do next.`;
}

export function CookingView({ recipe, onExit }: CookingViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoStartAttemptedRef = useRef(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Camera warming up…");
  const [cameraProblem, setCameraProblem] = useState("");
  const [cameraTry, setCameraTry] = useState(0);
  const [startingHandsFree, setStartingHandsFree] = useState(false);
  const [cameraSeed, setCameraSeed] = useState<CameraSeed | null>(null);
  const [voiceQuestionCount, setVoiceQuestionCount] = useState(0);
  const [moodState, setMoodState] = useState<{ mood: EllaMood; stepIndex: number }>(
    { mood: "idle", stepIndex: 0 },
  );
  const ellaMood = moodState.stepIndex === stepIndex ? moodState.mood : "idle";
  const setEllaMood = (mood: EllaMood) => setMoodState({ mood, stepIndex });
  const { companion } = useCompanion();
  const { language } = useLanguage();
  const step = recipe.steps[stepIndex];
  const nextStepText =
    stepIndex + 1 < recipe.steps.length ? recipe.steps[stepIndex + 1] : undefined;
  const {
    state: liveState,
    start: startLive,
    speakProactively,
    updateObservation,
  } = useLiveSession({
    recipeTitle: recipe.title,
    currentStep: step,
    companion: {
      voice: companion.voice,
      name: companion.name,
      style: companion.style,
      language: language.code,
    },
    onReply: setStatus,
    onError: setStatus,
    onSpeechStarted: () => setVoiceQuestionCount((count) => count + 1),
  });
  const applyCameraDecision = (decision: CookingAgentDecision) => {
    if (decision.seen) {
      updateObservation(decision.seen);
      if (!decision.say) setStatus(`Camera: ${decision.seen}`);
    }
    for (const action of decision.actions) {
      if (action.type === "next_step") {
        setStepIndex((current) => Math.min(current + 1, recipe.steps.length - 1));
      } else if (action.type === "go_back") {
        setStepIndex((current) => Math.max(0, current - 1));
      } else if (action.type === "go_to_step") {
        setStepIndex(Math.min(Math.max(action.step - 1, 0), recipe.steps.length - 1));
      } else if (action.type === "finish") {
        setStatus("Camera coach says this recipe is done — plate it cute.");
        setEllaMood("cheer");
      }
    }
    if (decision.say) {
      setStatus(decision.say);
      setEllaMood("talk");
      // The agent already rate-limits alerts. Do not make an extra HTTP TTS
      // request while the live companion is already answering the cook.
      speakProactively(decision.say);
    }
  };
  const { checkNow } = useCookingAgent({
    enabled: liveState === "listening" || liveState === "speaking",
    videoRef,
    recipe,
    stepIndex,
    companion: { name: companion.name, style: companion.style },
    initialFrame: cameraSeed,
    onDecision: applyCameraDecision,
    onError: setStatus,
  });

  useEffect(() => {
    // VAD fires at the beginning of a real utterance, leaving a moment for a
    // current frame to reach the Realtime prompt before the reply is created.
    if (voiceQuestionCount > 0) void checkNow();
  }, [checkNow, voiceQuestionCount]);
  const shownMood =
    liveState === "listening" || liveState === "connecting"
      ? "listen"
      : liveState === "speaking"
        ? "talk"
        : ellaMood;

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
        setStatus("Camera's on. Ella is taking a look…");
      })
      .catch((error) => {
        if (cancelled) return;
        setCameraProblem(describeCameraError(error));
        setStatus("Ella can't see the plate yet. Fix the camera and press Try again.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraTry]);

  async function enableHandsFree() {
    const video = videoRef.current;
    const frame = video ? captureCameraFrame(video) : null;
    if (!frame) {
      setStatus("Camera is still warming up. Point it at the food, then try hands-free again.");
      return;
    }
    setStartingHandsFree(true);
    setStatus("Ella is taking a quick look first…");
    setEllaMood("listen");
    const sessionId = newCookingSessionId();
    try {
      // This first image is deliberately separate from the live audio socket.
      // We ignore actions here: an opening glance must never advance a recipe.
      const decision = await checkCookingFrame(
        frame.image,
        sessionId,
        recipe,
        stepIndex,
        { name: companion.name, style: companion.style },
        cookingMemoryProfileId(),
      );
      const observation = decision.seen.trim();
      if (!observation) {
        setStatus("Ella needs a clearer look at the food before starting hands-free coaching.");
        setEllaMood("idle");
        return;
      }
      setCameraSeed({ frame, sessionId });
      setStatus(`Camera: ${observation}`);
      await startLive({ cameraObservation: observation, greeting: openingGreeting(observation) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ella could not check the camera yet. Try again.");
      setEllaMood("idle");
    } finally {
      setStartingHandsFree(false);
    }
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
                autoStartAttemptedRef.current = false;
                setCameraTry((count) => count + 1);
              }}
              className="rounded-full bg-cream px-4 py-1.5 font-semibold text-raspberry"
            >
              Try again
            </button>
          </div>
        ) : null}
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedData={() => {
              if (autoStartAttemptedRef.current) return;
              autoStartAttemptedRef.current = true;
              void enableHandsFree();
            }}
            className="aspect-video w-full bg-black object-cover lg:aspect-[16/10]"
          />
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-espresso/80 px-4 py-3 text-cream shadow-lg backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-peach">
              Now · Step {stepIndex + 1} of {recipe.steps.length}
            </p>
            <p className="mt-1 font-display text-lg leading-6">{step}</p>
            {nextStepText ? (
              <p className="mt-2 truncate border-t border-white/15 pt-2 text-sm text-cream/60">
                Up next: {nextStepText}
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-peach">Last turn — you’re plating.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_12px_32px_rgba(107,63,42,0.1)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-caramel">
            Hands-free cooking
          </p>
          <p className="mt-2 text-sm leading-6 text-cocoa">
            {startingHandsFree || liveState === "connecting"
              ? "Ella is checking the kitchen and connecting…"
              : "Ella is watching the pan. Speak normally whenever you need help."}
          </p>
        </div>
        <Ella size="sm" mood={shownMood} message={status} />
      </div>
    </section>
  );
}
