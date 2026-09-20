import { RECIPES } from "./recipes";
import type { Recipe } from "./types";

const STORAGE_KEY = "kitchen-companion-cookbook-v1";

export type CookbookState = {
  savedIds: string[];
  extraRecipes: Recipe[];
};

export const emptyCookbook: CookbookState = {
  savedIds: [],
  extraRecipes: [],
};

function parseCookbook(raw: string | null): CookbookState {
  if (!raw) return emptyCookbook;
  try {
    const parsed = JSON.parse(raw) as CookbookState;
    return {
      savedIds: Array.isArray(parsed.savedIds) ? parsed.savedIds : [],
      extraRecipes: Array.isArray(parsed.extraRecipes)
        ? parsed.extraRecipes
        : [],
    };
  } catch {
    return emptyCookbook;
  }
}

export function saveCookbook(state: CookbookState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Store API for useSyncExternalStore: React reads localStorage through these, so the
// cookbook needs no "copy it into state in an effect" step.
let cachedRaw: string | null = null;
let cachedState: CookbookState = emptyCookbook;
const listeners = new Set<() => void>();

/** Must return the same object until the stored data changes, so it re-parses only then. */
export function getCookbookSnapshot(): CookbookState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage blocked: behave as an empty cookbook
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseCookbook(raw);
  }
  return cachedState;
}

export function subscribeCookbook(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // changes from other tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function updateCookbook(
  update: (current: CookbookState) => CookbookState,
) {
  saveCookbook(update(getCookbookSnapshot()));
  listeners.forEach((listener) => listener());
}

export function allRecipes(extras: Recipe[]): Recipe[] {
  const extraIds = new Set(extras.map((recipe) => recipe.id));
  return [...extras, ...RECIPES.filter((recipe) => !extraIds.has(recipe.id))];
}
