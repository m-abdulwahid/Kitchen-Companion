"use client";

import { useEffect, useRef, useState } from "react";
import { Ella } from "@/components/Ella";
import { useCompanion } from "@/hooks/useCompanion";
import { useCookingAgent } from "@/hooks/useCookingAgent";
import { useLanguage } from "@/hooks/useLanguage";
import { useLiveSession, type LiveState } from "@/hooks/useLiveSession";
import { useVoiceAssistant, type VoiceState } from "@/hooks/useVoiceAssistant";
import { describeCameraError, requestCamera } from "@/lib/camera-error";
import { checkCookingFrame, type CookingAgentDecision } from "@/lib/cooking-agent-api";
import { captureCameraFrame, type CameraFrame } from "@/lib/camera-frame";
import { cookingMemoryProfileId } from "@/lib/cooking-profile";
import { saveCookingMemory } from "@/lib/memory-api";
import { ASSISTANT } from "@/lib/assistant";
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

function liveLabels(name: string): Record<LiveState, string> {
  return {
    idle: `Enable hands-free ${name}`,
    connecting: "Connecting live voice…",
    listening: `${name} is listening — just talk`,
    speaking: `${name} is talking — speak to interrupt`,
    error: "Retry hands-free voice",
  };
}

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
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Camera warming up…");
  const [checking, setChecking] = useState(false);
  const [cameraProblem, setCameraProblem] = useState("");
  const [cameraTry, setCameraTry] = useState(0);
  const [startingHandsFree, setStartingHandsFree] = useState(false);
  const [cameraSeed, setCameraSeed] = useState<CameraSeed | null>(null);
  const [voiceQuestionCount, setVoiceQuestionCount] = useState(0);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryStatus, setMemoryStatus] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [peekNext, setPeekNext] = useState(false);
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
  const stepSpeech = `Step ${stepIndex + 1}. ${step}`;
  const {
    state: voiceState,
    toggle: toggleVoice,
    speak,
    interruptSpeech: interruptLegacySpeech,
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
  const {
    state: liveState,
    start: startLive,
    stop: stopLive,
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
  const handsFreeActive =
    liveState === "connecting" || liveState === "listening" || liveState === "speaking";
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
  const { isWatching, framesSent, maxFrames, checkNow } = useCookingAgent({
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
    liveState === "listening" || liveState === "connecting" || voiceState === "recording"
      ? "listen"
      : liveState === "speaking" || voiceState === "speaking"
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
        setStatus("Camera's on. Tap Ask Ella and just say your question.");
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

  async function captureAndCheck() {
    const video = videoRef.current;
    if (!video) return;
    setChecking(true);
    setEllaMood("talk");
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
      setEllaMood(result.passed ? "cheer" : "idle");
    } catch {
      setStatus(`${ASSISTANT.name} couldn’t check that step. Is the voice service running?`);
      setEllaMood("idle");
    } finally {
      setChecking(false);
    }
  }

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
      interruptLegacySpeech();
      await startLive({ cameraObservation: observation, greeting: openingGreeting(observation) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ella could not check the camera yet. Try again.");
      setEllaMood("idle");
    } finally {
      setStartingHandsFree(false);
    }
  }

  function disableHandsFree() {
    stopLive();
    setCameraSeed(null);
  }

  function nextStep() {
    if (stepIndex >= recipe.steps.length - 1) {
      if (!handsFreeActive) speak(`That’s the last step. ${recipe.title} is done. You crushed it.`);
      setStatus("Last step — plate it cute.");
      setEllaMood("cheer");
      return;
    }
    setPeekNext(false);
    setStepIndex((value) => value + 1);
  }

  function prevStep() {
    setPeekNext(false);
    setStepIndex((value) => Math.max(0, value - 1));
  }

  async function updateCookingMemory(action: "remember" | "forget") {
    const fact = memoryDraft.trim();
    if (fact.length < 3) return;
    setSavingMemory(true);
    setMemoryStatus("");
    try {
      await saveCookingMemory(cookingMemoryProfileId(), fact, action);
      setMemoryStatus(action === "remember" ? "Saved for future cooks on this browser." : "Removed when a matching memory was found.");
      setMemoryDraft("");
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "Memory could not be updated.");
    } finally {
      setSavingMemory(false);
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
            className="aspect-video w-full bg-black object-cover lg:aspect-[16/10]"
          />
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-espresso/80 px-4 py-3 text-cream shadow-lg backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-peach">
              Now · Step {stepIndex + 1} of {recipe.steps.length}
            </p>
            <p className="mt-1 font-display text-lg leading-6">{step}</p>
            {nextStepText ? (
              <div className="mt-2 border-t border-white/15 pt-2">
                <button
                  type="button"
                  onClick={() => setPeekNext((value) => !value)}
                  className="text-xs font-semibold uppercase tracking-wide text-peach hover:text-cream"
                >
                  {peekNext ? "Hide what’s next" : "What’s next"}
                </button>
                {peekNext ? (
                  <p className="mt-1 text-sm leading-5 text-cream/85">
                    Step {stepIndex + 2}: {nextStepText}
                  </p>
                ) : (
                  <p className="mt-1 truncate text-sm text-cream/60">
                    Step {stepIndex + 2}: {nextStepText}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-peach">Last turn — you’re plating.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_12px_32px_rgba(107,63,42,0.1)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-caramel">
            Step {stepIndex + 1} of {recipe.steps.length}
          </p>
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
              disabled={handsFreeActive}
              onClick={() => speak(stepSpeech)}
              className="rounded-2xl bg-peach py-2.5 text-sm font-semibold text-cocoa disabled:opacity-60"
            >
              Repeat
            </button>
            <button
              type="button"
              disabled={checking || isWatching}
              onClick={captureAndCheck}
              className="rounded-2xl bg-raspberry py-2.5 text-sm font-semibold text-cream disabled:opacity-60"
            >
              {isWatching ? "Watching pan…" : checking ? "Looking…" : "Check step"}
            </button>
            <button
              type="button"
              disabled={voiceState === "thinking" || handsFreeActive}
              onClick={() => toggleVoice(step)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-tomato py-3.5 font-display text-lg text-cream shadow disabled:opacity-60"
            >
              <img
                src="/brand/whisk-ella-avatar.png"
                alt=""
                className="h-8 w-7 bg-transparent object-contain"
              />
              {askLabels(ASSISTANT.name)[voiceState]}
            </button>
            <button
              type="button"
              disabled={startingHandsFree || liveState === "connecting"}
              onClick={() => {
                if (liveState === "idle" || liveState === "error") {
                  void enableHandsFree();
                } else disableHandsFree();
              }}
              className="rounded-2xl bg-espresso py-3.5 font-display text-lg text-cream shadow disabled:opacity-60"
            >
              {liveState === "listening" || liveState === "speaking"
                ? "Disable hands-free"
                : startingHandsFree ? "Looking at your kitchen…" : liveLabels(ASSISTANT.name)[liveState]}
            </button>
            {(liveState === "listening" || liveState === "speaking") && (
              <p className="col-span-2 text-center text-xs font-semibold text-caramel">
                Hands-free is on. Ella watches changed frames ({framesSent}/{maxFrames}) and stops talking when you speak.
              </p>
            )}
          </div>
        </div>
        <Ella size="sm" mood={shownMood} message={status} />
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_12px_32px_rgba(107,63,42,0.1)]">
          <p className="font-display text-lg text-espresso">Ella&apos;s kitchen memory</p>
          <p className="mt-1 text-xs leading-5 text-cocoa">
            Save only a preference you want this browser to remember, like “no peanuts” or “likes extra spice”.
          </p>
          <input
            value={memoryDraft}
            onChange={(event) => setMemoryDraft(event.target.value)}
            maxLength={240}
            placeholder="A cooking preference…"
            className="mt-3 w-full rounded-xl border border-peach bg-cream px-3 py-2 text-sm text-espresso outline-none placeholder:text-caramel focus:border-tomato"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={savingMemory || memoryDraft.trim().length < 3}
              onClick={() => void updateCookingMemory("remember")}
              className="rounded-xl bg-espresso py-2 text-sm font-semibold text-cream disabled:opacity-60"
            >
              {savingMemory ? "Saving…" : "Remember"}
            </button>
            <button
              type="button"
              disabled={savingMemory || memoryDraft.trim().length < 3}
              onClick={() => void updateCookingMemory("forget")}
              className="rounded-xl bg-peach py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
            >
              Forget
            </button>
          </div>
          {memoryStatus ? <p className="mt-2 text-xs font-medium text-caramel">{memoryStatus}</p> : null}
        </div>
      </div>
    </section>
  );
}
