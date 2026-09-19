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

/** Send a recorded question; get back Pip's answer as text and speech. */
export async function askVoice(
  recording: Blob,
  sessionId: string,
  currentStep: string,
  signal?: AbortSignal,
): Promise<VoiceReply> {
  const form = new FormData();
  form.append("audio", recording, `clip.${extensionFor(recording.type)}`);
  form.append("session_id", sessionId);
  form.append("current_step", currentStep);

  const response = await fetch(`${VOICE_API_URL}/api/voice`, {
    method: "POST",
    body: form,
    signal,
  });
  return readReply(response);
}

/** Have Pip read text aloud in the Omni voice (recipe steps, feedback). */
export async function speakText(
  text: string,
  signal?: AbortSignal,
): Promise<VoiceReply> {
  const response = await fetch(`${VOICE_API_URL}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  return readReply(response);
}
