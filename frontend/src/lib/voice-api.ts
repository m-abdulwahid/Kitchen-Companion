import type { VisionCheckResult } from "./types";

/** Client for the voice service (see /voice and docs/omni-voice.md). */
export const VOICE_API_URL =
  process.env.NEXT_PUBLIC_VOICE_API_URL ?? "http://localhost:8000";

export type VoiceReply = {
  text: string;
  /** Base64 audio of the spoken reply, or null if the service only returned text. */
  audio: string | null;
  audioMime: string | null;
};

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

type VoiceReplyJson = {
  text?: string;
  audio?: string | null;
  audio_mime?: string | null;
};

async function readReply(response: Response): Promise<VoiceReply> {
  if (!response.ok) {
    throw new Error(`Voice service error ${response.status}`);
  }
  const data = (await response.json()) as VoiceReplyJson;
  return {
    text: data.text ?? "",
    audio: data.audio ?? null,
    audioMime: data.audio_mime ?? null,
  };
}

/** Who answers, and in what language: the chosen companion (voice, name, personality) and language code. */
export type Speaker = { voice: string; name: string; style: string; language: string };

/** Send a recorded question; get back the companion's answer as text and speech. */
export async function askVoice(
  recording: Blob,
  sessionId: string,
  currentStep: string,
  who: Speaker,
  signal?: AbortSignal,
): Promise<VoiceReply> {
  const form = new FormData();
  form.append("audio", recording, `clip.${extensionFor(recording.type)}`);
  form.append("session_id", sessionId);
  form.append("current_step", currentStep);
  form.append("voice", who.voice);
  form.append("assistant_name", who.name);
  form.append("style", who.style);
  form.append("language", who.language);

  const response = await fetch(`${VOICE_API_URL}/api/voice`, {
    method: "POST",
    body: form,
    signal,
  });
  return readReply(response);
}

/**
 * Read text aloud in an Omni voice (recipe steps, feedback). Omit `voice` for the service's default.
 * With a `language` other than English the service translates first, and `text` in the reply is the translation.
 */
export async function speakText(
  text: string,
  voice?: string,
  language?: string,
  signal?: AbortSignal,
): Promise<VoiceReply> {
  const response = await fetch(`${VOICE_API_URL}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, language }),
    signal,
  });
  return readReply(response);
}

/**
 * "Check my step": send a camera photo (a JPEG data URI) and the current step; get back whether
 * it looks done and what to say about it. Feedback is English; speak it with speakText to translate.
 */
export async function checkStepWithVision(
  imageDataUrl: string,
  step: string,
  who: Pick<Speaker, "name" | "style">,
  signal?: AbortSignal,
): Promise<VisionCheckResult> {
  const response = await fetch(`${VOICE_API_URL}/api/vision/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageDataUrl,
      step,
      assistant_name: who.name,
      style: who.style,
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Voice service error ${response.status}`);
  }
  const data = (await response.json()) as { passed?: boolean | null; feedback?: string };
  return { passed: data.passed === true, feedback: data.feedback ?? "" };
}
