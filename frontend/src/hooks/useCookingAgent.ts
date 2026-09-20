"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { checkCookingFrame, type CookingAgentDecision } from "@/lib/cooking-agent-api";
import { captureCameraFrame, hasVisibleCameraImage, type CameraFrame } from "@/lib/camera-frame";
import { cookingMemoryProfileId } from "@/lib/cooking-profile";
import type { Recipe } from "@/lib/types";
import type { Speaker } from "@/lib/voice-api";

const FRAME_INTERVAL_MS = 3_000;
const MAX_AUTO_FRAMES = 12;
const CHANGE_THRESHOLD = 9;

type Options = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  recipe: Recipe;
  stepIndex: number;
  companion: Pick<Speaker, "name" | "style">;
  /** The visual check completed immediately before hands-free mode began. */
  initialFrame?: { frame: CameraFrame; sessionId: string } | null;
  onDecision: (decision: CookingAgentDecision) => void;
  onError: (message: string) => void;
};

function newSessionId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
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
  const memoryProfileIdRef = useRef("");
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

  const checkFrame = useCallback(async (force = false) => {
    const current = optionsRef.current;
    if (!current.enabled || haltedRef.current || busyRef.current) return;
    const video = current.videoRef.current;
    if (!video) return;
    const frame = captureCameraFrame(video);
    if (!frame || !hasVisibleCameraImage(frame)) return;
    if (!force && (
      lastThumbnailRef.current &&
      imageDifference(frame.thumbnail, lastThumbnailRef.current) < CHANGE_THRESHOLD
    )) return;
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
      memoryProfileIdRef.current ||= cookingMemoryProfileId();
      const decision = await checkCookingFrame(
        frame.image, sessionIdRef.current, current.recipe, current.stepIndex, current.companion,
        memoryProfileIdRef.current, controller.signal,
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

  /** Use one current frame when the cook begins a spoken question. */
  const checkNow = useCallback(() => checkFrame(true), [checkFrame]);

  useEffect(() => {
    if (!options.enabled) {
      haltedRef.current = false;
      sentRef.current = 0;
      lastThumbnailRef.current = null;
      stopWatching();
      return;
    }
    haltedRef.current = false;
    const seed = optionsRef.current.initialFrame;
    if (seed) {
      // The first vision request was already made before live audio was opened.
      // Count it and seed change detection so it is never paid for twice.
      sessionIdRef.current = seed.sessionId;
      lastThumbnailRef.current = seed.frame.thumbnail;
      sentRef.current = 1;
    } else {
      void checkFrame();
    }
    intervalRef.current = window.setInterval(() => void checkFrame(), FRAME_INTERVAL_MS);
    return stopWatching;
  }, [checkFrame, options.enabled, stopWatching]);

  return {
    isWatching: options.enabled && Math.max(framesSent, options.initialFrame ? 1 : 0) < MAX_AUTO_FRAMES,
    framesSent: options.enabled ? Math.max(framesSent, options.initialFrame ? 1 : 0) : 0,
    maxFrames: MAX_AUTO_FRAMES,
    checkNow,
  };
}
