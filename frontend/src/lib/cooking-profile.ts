const PROFILE_KEY = "kitchen-companion:memory-profile";
const MEMORY_FACTS_KEY = "kitchen-companion:memory-facts";
const MAX_MEMORY_FACTS = 3;

function newProfileId(): string {
  return crypto.randomUUID?.() ?? `cook_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * A random browser-local id, not a name or login. Backboard uses it only to
 * isolate one cook's durable memories from another cook's profile.
 */
export function cookingMemoryProfileId(): string {
  try {
    const saved = window.localStorage.getItem(PROFILE_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const created = newProfileId();
    window.localStorage.setItem(PROFILE_KEY, created);
    return created;
  } catch {
    // Storage can be blocked in private browsing. The temporary id still
    // keeps this tab isolated, but intentionally does not persist afterward.
    return newProfileId();
  }
}

function readMemoryFacts(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MEMORY_FACTS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((fact): fact is string => typeof fact === "string")
      .map((fact) => fact.trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, MAX_MEMORY_FACTS);
  } catch {
    return [];
  }
}

/** Keep confirmed, explicit facts available during Backboard's indexing delay. */
export function recordCookingMemory(action: "remember" | "forget", fact: string): void {
  const cleaned = fact.trim().slice(0, 240);
  if (!cleaned) return;
  try {
    const facts = readMemoryFacts();
    const normalized = cleaned.toLocaleLowerCase();
    const next = action === "remember"
      ? [cleaned, ...facts.filter((item) => item.toLocaleLowerCase() !== normalized)].slice(0, MAX_MEMORY_FACTS)
      : facts.filter((item) => item.toLocaleLowerCase() !== normalized);
    window.localStorage.setItem(MEMORY_FACTS_KEY, JSON.stringify(next));
  } catch {
    // Backboard remains the durable source when browser storage is unavailable.
  }
}

/** Explicit browser-local facts, sent only to this cook's own live session. */
export function cookingMemoryHint(): string {
  const facts = readMemoryFacts();
  return facts.length ? `Explicit cooking preferences from this browser: ${facts.join(" | ")}` : "";
}
