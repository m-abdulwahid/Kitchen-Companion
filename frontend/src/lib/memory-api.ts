import { VOICE_API_URL } from "@/lib/voice-api";

export async function saveCookingMemory(
  profileId: string,
  fact: string,
  action: "remember" | "forget",
): Promise<void> {
  const response = await fetch(`${VOICE_API_URL}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id: profileId, fact, action }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail || `Memory service error ${response.status}`);
  }
}
