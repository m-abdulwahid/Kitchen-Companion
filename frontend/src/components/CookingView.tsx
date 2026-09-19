"use client";

import { useEffect, useRef, useState } from "react";
import { Pip } from "@/components/Pip";
import { ASSISTANT } from "@/lib/assistant";
import { answerCookingQuestion, checkStepWithVision } from "@/lib/mocks";
import type { Recipe } from "@/lib/types";

type CookingViewProps = {
  recipe: Recipe;
  onExit: () => void;
};

function speak(text: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

function getSpeechRecognition(): SpeechRecognition | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function CookingView({ recipe, onExit }: CookingViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Camera warming up…");
  const [listening, setListening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [pipMood, setPipMood] = useState<"idle" | "talk" | "listen" | "cheer">(
    "idle",
  );

  const step = recipe.steps[stepIndex];

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
        setStatus("Camera blocked — allow the webcam to let Pip watch the pan.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    setPipMood("talk");
    speak(`Step ${stepIndex + 1}. ${step}`);
    const timer = window.setTimeout(() => setPipMood("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [step, stepIndex]);

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
    const result = await checkStepWithVision(imageDataUrl, step, stepIndex);
    setStatus(result.feedback);
    speak(result.feedback);
    setChecking(false);
    setPipMood(result.passed ? "cheer" : "idle");
  }

  function startListening() {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setStatus("Speech recognition needs Chrome / Edge (webkitSpeechRecognition).");
      return;
    }
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = async (event) => {
      const question = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(question);
      setListening(false);
      setPipMood("talk");
      const answer = await answerCookingQuestion(question, recipe, step);
      setStatus(answer);
      speak(answer);
      setPipMood("idle");
    };
    recognition.onerror = () => {
      setListening(false);
      setPipMood("idle");
      setStatus("Didn’t catch that — tap Ask Pip and try again.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    setPipMood("listen");
    recognition.start();
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
              onClick={() => speak(step)}
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
              {checking ? "Pip is looking…" : "Check my step"}
            </button>
            <button
              type="button"
              onClick={startListening}
              className="col-span-2 rounded-2xl border-2 border-tomato py-3 font-semibold text-tomato"
            >
              {listening ? "Listening…" : `Ask ${ASSISTANT.name}`}
            </button>
          </div>
        </div>
        <Pip
          mood={pipMood}
          message={
            transcript
              ? `You asked: “${transcript}” — ${status}`
              : status
          }
        />
      </div>
    </section>
  );
}
