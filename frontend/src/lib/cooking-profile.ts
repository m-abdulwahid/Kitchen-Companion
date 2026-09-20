const PROFILE_KEY = "kitchen-companion:memory-profile";

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
