"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LANGUAGE } from "@/lib/languages";
import { askVoice, speakText, type Speaker } from "@/lib/voice-api";

export type VoiceState = "idle" | "recording" | "thinking" | "speaking";

type Options = {
  /** Called with the reply text as soon as it arrives (audio starts right after). */
  onReply: (text: string) => void;
  /** Called with a short user-facing message when something goes wrong. */
  onError: (message: string) => void;
  /** Called with the translated text when something is read aloud in a non-English language. */
  onSpoken?: (text: string) => void;
  /** Who is talking: the chosen companion's voice, name and personality, and the language. */
  companion: Speaker;
};

const MIN_RECORDING_MS = 500;
const MAX_RECORDING_MS = 15000;

function pickMimeType(): string {
  for (const type of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let the browser choose (Safari picks mp4 on its own)
}

function newSessionId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * Pip's voice, both directions, one audio player.
 * - toggle(step): tap-to-talk. First call starts recording, second sends it; the spoken
 *   reply plays automatically. Calling it while Pip is talking interrupts and records.
 * - speak(text, upcoming?): Pip reads text aloud (recipe steps, feedback). Ignored while the
 *   user is asking a question; a newer speak() replaces an older one. If `upcoming` is given
 *   (the next step), its audio is fetched in the background once this one has arrived, so the
 *   voice service has it cached by the time the user moves on.
 * Both use the voice service (Omni) and fall back to the browser's voice if it fails.
 */
export function useVoiceAssistant({ onReply, onError, onSpoken, companion }: Options) {
  const [state, setState] = useState<VoiceState>("idle");
  const stateRef = useRef<VoiceState>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const stepRef = useRef("");
  const startedAtRef = useRef(0);
  const maxTimerRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onReply, onError, onSpoken });
  const companionRef = useRef(companion);

  useEffect(() => {
    callbacksRef.current = { onReply, onError, onSpoken };
    companionRef.current = companion;
  });

  const changeState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    utteranceRef.current = null; // so its late "canceled" event is ignored
    window.speechSynthesis?.cancel();
  }, []);

  /** Stop anything Pip is saying or about to say. */
  const interruptSpeech = useCallback(() => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    stopPlayback();
    if (stateRef.current === "speaking") changeState("idle");
  }, [changeState, stopPlayback]);

  const speakInBrowser = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) {
        changeState("idle");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const finish = () => {
        if (utteranceRef.current === utterance) changeState("idle");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      utteranceRef.current = utterance;
      changeState("speaking");
      window.speechSynthesis.speak(utterance);
    },
    [changeState],
  );

  const playReply = useCallback(
    (text: string, audio: string | null, mime: string | null) => {
      if (!audio) {
        speakInBrowser(text);
        return;
      }
      const player = new Audio(`data:${mime ?? "audio/wav"};base64,${audio}`);
      audioRef.current = player;
      player.onended = () => {
        if (audioRef.current === player) changeState("idle");
      };
      player.onerror = () => {
        if (audioRef.current === player) speakInBrowser(text);
      };
      changeState("speaking");
      player.play().catch(() => {
        if (audioRef.current === player) speakInBrowser(text);
      });
    },
    [changeState, speakInBrowser],
  );

  /** Ask the voice service to generate (and cache) audio we don't need yet. Errors are ignored. */
  const prefetch = useCallback((text: string) => {
    const { voice, language } = companionRef.current;
    const key = `${voice}|${language}|${text}`;
    if (prefetchedRef.current.has(key)) return;
    prefetchedRef.current.add(key);
    speakText(text, voice, language).catch(() => prefetchedRef.current.delete(key));
  }, []);

  const speak = useCallback(
    async (text: string, upcoming?: string) => {
      if (stateRef.current === "recording" || stateRef.current === "thinking") {
        return; // the user's question takes priority
      }
      interruptSpeech();
      const controller = new AbortController();
      speakAbortRef.current = controller;
      try {
        const { voice, language } = companionRef.current;
        const reply = await speakText(text, voice, language, controller.signal);
        if (controller.signal.aborted) return;
        // Show what is being said when it was translated.
        if (language !== DEFAULT_LANGUAGE.code && reply.text) {
          callbacksRef.current.onSpoken?.(reply.text);
        }
        playReply(reply.text || text, reply.audio, reply.audioMime);
        if (upcoming) prefetch(upcoming);
      } catch {
        if (controller.signal.aborted) return;
        speakInBrowser(text); // service down: still read it out
      }
    },
    [interruptSpeech, playReply, prefetch, speakInBrowser],
  );

  const send = useCallback(
    async (recording: Blob) => {
      changeState("thinking");
      const controller = new AbortController();
      abortRef.current = controller;
      sessionIdRef.current ??= newSessionId();
      try {
        const reply = await askVoice(
          recording,
          sessionIdRef.current,
          stepRef.current,
          companionRef.current,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        callbacksRef.current.onReply(reply.text);
        playReply(reply.text, reply.audio, reply.audioMime);
      } catch (error) {
        if (controller.signal.aborted) return;
        changeState("idle");
        callbacksRef.current.onError(
          error instanceof TypeError
            ? "Can't reach the voice service — is it running?"
            : `${companionRef.current.name} couldn't answer that — try again.`,
        );
      }
    },
    [changeState, playReply],
  );

  const stopRecording = useCallback(() => {
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    interruptSpeech();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      callbacksRef.current.onError(
        `Mic blocked — allow the microphone to ask ${companionRef.current.name}.`,
      );
      return;
    }
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      releaseMic();
      recorderRef.current = null;
      const heldMs = performance.now() - startedAtRef.current;
      if (!chunks.length || heldMs < MIN_RECORDING_MS) {
        changeState("idle");
        callbacksRef.current.onError("Too short — tap, ask your question, tap again.");
        return;
      }
      void send(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();
    recorder.start();
    changeState("recording");
    maxTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
  }, [changeState, interruptSpeech, releaseMic, send, stopRecording]);

  /** Pass the current recipe step so Pip answers in context. */
  const toggle = useCallback(
    (currentStep: string) => {
      stepRef.current = currentStep;
      const current = stateRef.current;
      if (current === "recording") stopRecording();
      else if (current === "idle" || current === "speaking") void startRecording();
    },
    [startRecording, stopRecording],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      speakAbortRef.current?.abort();
      if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state === "recording") recorder.stop();
      }
      releaseMic();
      stopPlayback();
    };
  }, [releaseMic, stopPlayback]);

  return { state, toggle, speak };
}
