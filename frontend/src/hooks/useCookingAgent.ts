"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { checkCookingFrame, type CookingAgentDecision } from "@/lib/cooking-agent-api";
import type { Recipe } from "@/lib/types";
import type { Speaker } from "@/lib/voice-api";

const FRAME_WIDTH = 640;
const FRAME_INTERVAL_MS = 5_000;
const MAX_AUTO_FRAMES = 12;
const CHANGE_THRESHOLD = 9;

type Options = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  recipe: Recipe;
  stepIndex: number;
  companion: Pick<Speaker, "name" | "style">;
  onDecision: (decision: CookingAgentDecision) => void;
  onError: (message: string) => void;
};

type Frame = { image: string; thumbnail: Uint8Array };

function newSessionId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function captureFrame(video: HTMLVideoElement): Frame | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const width = Math.min(FRAME_WIDTH, video.videoWidth);
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  const tiny = document.createElement("canvas");
  tiny.width = 32;
  tiny.height = 24;
  const tinyContext = tiny.getContext("2d", { willReadFrequently: true });
  if (!tinyContext) return null;
  tinyContext.drawImage(canvas, 0, 0, tiny.width, tiny.height);
  const pixels = tinyContext.getImageData(0, 0, tiny.width, tiny.height).data;
  const thumbnail = new Uint8Array(tiny.width * tiny.height);
  for (let index = 0; index < thumbnail.length; index += 1) {
    thumbnail[index] = (pixels[index * 4] + pixels[index * 4 + 1] + pixels[index * 4 + 2]) / 3;
  }
  return { image: canvas.toDataURL("image/jpeg", 0.6), thumbnail };
}

function imageDifference(current: Uint8Array, previous: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < current.length; index += 1) total += Math.abs(current[index] - previous[index]);
  return total / current.length;
}

/** Periodically asks the HTTP cooking agent about changed camera frames. */
export function useCookingAgent(options: Options) {
  const [framesSent, setFramesSent] = useState(0);
  const optionsRef = useRef(options);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef("");
  const lastThumbnailRef = useRef<Uint8Array | null>(null);
  const sentRef = useRef(0);
  const busyRef = useRef(false);
  const haltedRef = useRef(false);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    lastThumbnailRef.current = null;
  }, [options.stepIndex]);

  const stopWatching = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
  }, []);

  const checkFrame = useCallback(async () => {
    const current = optionsRef.current;
    if (!current.enabled || haltedRef.current || busyRef.current) return;
    const video = current.videoRef.current;
    if (!video) return;
    const frame = captureFrame(video);
    if (!frame) return;
    if (
      lastThumbnailRef.current &&
      imageDifference(frame.thumbnail, lastThumbnailRef.current) < CHANGE_THRESHOLD
    ) return;
    if (sentRef.current >= MAX_AUTO_FRAMES) {
      haltedRef.current = true;
      stopWatching();
      current.onError("Camera coach paused after 12 checks to protect your API credits. Re-enable hands-free to resume.");
      return;
    }
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      sessionIdRef.current ||= newSessionId();
      const decision = await checkCookingFrame(
        frame.image, sessionIdRef.current, current.recipe, current.stepIndex, current.companion, controller.signal,
      );
      if (controller.signal.aborted) return;
      lastThumbnailRef.current = frame.thumbnail;
      sentRef.current += 1;
      setFramesSent(sentRef.current);
      current.onDecision(decision);
      if (sentRef.current >= MAX_AUTO_FRAMES) {
        haltedRef.current = true;
        stopWatching();
        current.onError("Camera coach paused after 12 checks to protect your API credits. Re-enable hands-free to resume.");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        current.onError(error instanceof Error ? error.message : "Camera coach could not check that frame.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      busyRef.current = false;
    }
  }, [stopWatching]);

  useEffect(() => {
    if (!options.enabled) {
      haltedRef.current = false;
      sentRef.current = 0;
      lastThumbnailRef.current = null;
      stopWatching();
      return;
    }
    haltedRef.current = false;
    void checkFrame();
    intervalRef.current = window.setInterval(() => void checkFrame(), FRAME_INTERVAL_MS);
    return stopWatching;
  }, [checkFrame, options.enabled, stopWatching]);

  return {
    isWatching: options.enabled && framesSent < MAX_AUTO_FRAMES,
    framesSent,
    maxFrames: MAX_AUTO_FRAMES,
  };
}
