import type { Recipe } from "@/lib/types";
import { VOICE_API_URL, type Speaker } from "@/lib/voice-api";
import * as Sentry from "@sentry/nextjs";

export type CookingAgentAction =
  | { type: "next_step" }
  | { type: "go_back" }
  | { type: "go_to_step"; step: number }
  | { type: "repeat_step" }
  | { type: "set_timer"; seconds: number; label: string }
  | { type: "cancel_timer"; label: string }
  | { type: "finish" };

export type CookingAgentDecision = {
  seen: string;
  say: string;
  actions: CookingAgentAction[];
  stepDone: boolean | null;
  note: string;
};

type AgentResponse = {
  seen?: string;
  say?: string;
  actions?: CookingAgentAction[];
  step_done?: boolean | null;
  note?: string;
};

export async function checkCookingFrame(
  image: string,
  sessionId: string,
  recipe: Recipe,
  stepIndex: number,
  companion: Pick<Speaker, "name" | "style">,
  memoryProfileId: string,
  signal?: AbortSignal,
): Promise<CookingAgentDecision> {
  return Sentry.startSpan({ name: "camera-agent turn", op: "ai.camera" }, async (span) => {
    const response = await fetch(`${VOICE_API_URL}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        session_id: sessionId,
        memory_profile_id: memoryProfileId,
        event: "frame",
        recipe: {
          title: recipe.title,
          steps: recipe.steps,
          ingredients: recipe.ingredients,
          servings: recipe.servings,
        },
        step_index: stepIndex,
        assistant_name: companion.name,
        style: companion.style,
        auto_advance: true,
        image,
      }),
    });
    span?.setAttribute("http.response.status_code", response.status);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      if (response.status >= 500) {
        throw new Error("Ella's camera check is temporarily unavailable. She'll keep trying shortly.");
      }
      throw new Error(body.detail || `Cooking agent error ${response.status}`);
    }
    const data = (await response.json()) as AgentResponse;
    return {
      seen: data.seen ?? "",
      say: data.say ?? "",
      actions: Array.isArray(data.actions) ? data.actions : [],
      stepDone: typeof data.step_done === "boolean" ? data.step_done : null,
      note: data.note ?? "",
    };
  });
}
