"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liveSocketUrl } from "@/lib/live-api";
import type { Speaker } from "@/lib/voice-api";

export type LiveState = "idle" | "connecting" | "listening" | "speaking" | "error";

type Options = {
  recipeTitle: string;
  currentStep: string;
  companion: Speaker;
  onReply: (text: string) => void;
  onError: (message: string) => void;
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  error?: { message?: string };
  message?: string;
};

const OUTPUT_SAMPLE_RATE = 24_000;

function newSessionId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function eventMessage(event: RealtimeEvent): string {
  return event.error?.message || event.message || "Live voice connection ended unexpectedly.";
}

/**
 * Owns the browser half of the hands-free Realtime conversation.
 *
 * AudioWorklet produces 24 kHz PCM16 microphone frames. Incoming Omni PCM16
 * chunks are scheduled onto one AudioContext timeline, so replies never overlap.
 */
export function useLiveSession({ recipeTitle, currentStep, companion, onReply, onError }: Options) {
  const [state, setState] = useState<LiveState>("idle");
  const stateRef = useRef<LiveState>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackEndsAtRef = useRef(0);
  const responseFinishedRef = useRef(false);
  const readyRef = useRef(false);
  const closedByUserRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  const transcriptRef = useRef("");
  const callbacksRef = useRef({ onReply, onError });
  const contextRef = useRef({ recipeTitle, currentStep, companion });

  useEffect(() => {
    callbacksRef.current = { onReply, onError };
    contextRef.current = { recipeTitle, currentStep, companion };
  }, [companion, currentStep, onError, onReply, recipeTitle]);

  const changeState = useCallback((next: LiveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const flushPlayback = useCallback(() => {
    clearFinishTimer();
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A completed source cannot be stopped again.
      }
    }
    playbackSourcesRef.current.clear();
    playbackEndsAtRef.current = audioContextRef.current?.currentTime ?? 0;
    responseFinishedRef.current = false;
    if (stateRef.current === "speaking") changeState("listening");
  }, [changeState, clearFinishTimer]);

  const cleanupMedia = useCallback(() => {
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    muteRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const maybeFinishResponse = useCallback(() => {
    if (!responseFinishedRef.current) return;
    const context = audioContextRef.current;
    if (!context) return;
    const delay = Math.max(0, (playbackEndsAtRef.current - context.currentTime) * 1000 + 25);
    const expectedEnd = playbackEndsAtRef.current;
    clearFinishTimer();
    finishTimerRef.current = window.setTimeout(() => {
      if (
        responseFinishedRef.current &&
        playbackEndsAtRef.current <= expectedEnd + 0.001 &&
        stateRef.current === "speaking"
      ) {
        changeState("listening");
      }
    }, delay);
  }, [changeState, clearFinishTimer]);

  const queueAudio = useCallback(
    (encoded: string) => {
      const context = audioContextRef.current;
      if (!context || !encoded) return;
      const bytes = decodeBase64(encoded);
      if (bytes.byteLength < 2) return;
      const samples = Math.floor(bytes.byteLength / 2);
      const buffer = context.createBuffer(1, samples, OUTPUT_SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < samples; index += 1) {
        channel[index] = view.getInt16(index * 2, true) / 0x8000;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const startAt = Math.max(context.currentTime + 0.03, playbackEndsAtRef.current);
      playbackEndsAtRef.current = startAt + buffer.duration;
      source.onended = () => {
        playbackSourcesRef.current.delete(source);
      };
      playbackSourcesRef.current.add(source);
      source.start(startAt);
      responseFinishedRef.current = false;
      changeState("speaking");
    },
    [changeState],
  );

  const stop = useCallback(() => {
    closedByUserRef.current = true;
    readyRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    flushPlayback();
    cleanupMedia();
    changeState("idle");
  }, [changeState, cleanupMedia, flushPlayback]);

  const sendControl = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (readyRef.current && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const interrupt = useCallback(() => {
    flushPlayback();
    sendControl({ type: "interrupt" });
  }, [flushPlayback, sendControl]);

  /** Speak a validated camera-coach update only when the companion is free to respond. */
  const speakProactively = useCallback((text: string): boolean => {
    const message = text.trim().slice(0, 500);
    const socket = socketRef.current;
    if (
      !message ||
      !readyRef.current ||
      stateRef.current !== "listening" ||
      socket?.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    responseFinishedRef.current = false;
    socket.send(JSON.stringify({ type: "proactive", text: message }));
    return true;
  }, []);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      switch (event.type) {
        case "relay.ready":
          readyRef.current = true;
          changeState("listening");
          return;
        case "relay.error":
        case "error":
          callbacksRef.current.onError(eventMessage(event));
          changeState("error");
          return;
        case "input_audio_buffer.speech_started":
          // A new utterance must always beat an old reply.
          if (stateRef.current === "speaking") interrupt();
          return;
        case "response.audio.delta":
          queueAudio(event.delta ?? "");
          return;
        case "response.audio_transcript.delta":
        case "response.text.delta":
          transcriptRef.current += event.delta ?? "";
          return;
        case "response.audio_transcript.done":
          transcriptRef.current = event.transcript ?? transcriptRef.current;
          return;
        case "response.text.done":
          transcriptRef.current = event.text ?? transcriptRef.current;
          return;
        case "response.audio.done":
        case "response.done":
          responseFinishedRef.current = true;
          if (transcriptRef.current.trim()) callbacksRef.current.onReply(transcriptRef.current.trim());
          transcriptRef.current = "";
          maybeFinishResponse();
          return;
        default:
          return;
      }
    },
    [changeState, interrupt, maybeFinishResponse, queueAudio],
  );

  const start = useCallback(async () => {
    if (stateRef.current === "connecting" || stateRef.current === "listening" || stateRef.current === "speaking") {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      callbacksRef.current.onError("Hands-free voice needs a browser with microphone and AudioWorklet support.");
      changeState("error");
      return;
    }
    closedByUserRef.current = false;
    changeState("connecting");
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = new AudioContext();
      await context.audioWorklet.addModule("/pcm-capture-worklet.js");
      await context.resume();
      const source = context.createMediaStreamSource(microphone);
      const worklet = new AudioWorkletNode(context, "pcm-capture");
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(worklet).connect(mute).connect(context.destination);
      microphoneRef.current = microphone;
      audioContextRef.current = context;
      sourceRef.current = source;
      workletRef.current = worklet;
      muteRef.current = mute;

      const socket = new WebSocket(liveSocketUrl(newSessionId()));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      worklet.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (readyRef.current && socket.readyState === WebSocket.OPEN) socket.send(data);
      };
      socket.onopen = () => {
        const details = contextRef.current;
        socket.send(JSON.stringify({
          type: "session.configure",
          recipe_title: details.recipeTitle,
          current_step: details.currentStep,
          companion: details.companion,
        }));
      };
      socket.onmessage = (message) => {
        if (typeof message.data !== "string") return;
        try {
          handleEvent(JSON.parse(message.data) as RealtimeEvent);
        } catch {
          callbacksRef.current.onError("The live voice service sent an unreadable response.");
          changeState("error");
        }
      };
      socket.onerror = () => {
        callbacksRef.current.onError("Can't reach live voice — is the backend running on port 8001?");
      };
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        readyRef.current = false;
        cleanupMedia();
        flushPlayback();
        if (!closedByUserRef.current) {
          callbacksRef.current.onError("Live voice disconnected. You can enable it again without losing your step.");
          changeState("error");
        }
      };
    } catch {
      cleanupMedia();
      callbacksRef.current.onError("Mic blocked — allow the microphone to enable hands-free cooking.");
      changeState("error");
    }
  }, [changeState, cleanupMedia, flushPlayback, handleEvent]);

  const updateStep = useCallback(
    (step: string) => {
      contextRef.current = { ...contextRef.current, currentStep: step };
      sendControl({ type: "step", current_step: step });
    },
    [sendControl],
  );

  useEffect(() => {
    updateStep(currentStep);
  }, [currentStep, updateStep]);

  useEffect(() => stop, [stop]);

  return { state, start, stop, interrupt, speakProactively, updateStep };
}
