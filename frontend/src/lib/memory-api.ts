import { VOICE_API_URL } from "@/lib/voice-api";
import * as Sentry from "@sentry/nextjs";

export async function saveCookingMemory(
  profileId: string,
  fact: string,
  action: "remember" | "forget",
): Promise<void> {
  await Sentry.startSpan({ name: `Backboard memory ${action}`, op: "backboard.memory" }, async (span) => {
    const response = await fetch(`${VOICE_API_URL}/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, fact, action }),
    });
    span?.setAttribute("http.response.status_code", response.status);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new Error(body.detail || `Memory service error ${response.status}`);
    }
  });
}
