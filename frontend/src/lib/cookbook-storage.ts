import { RECIPES } from "./recipes";
import type { Recipe } from "./types";

const STORAGE_KEY = "kitchen-companion-cookbook-v1";

export type CookbookState = {
  savedIds: string[];
  extraRecipes: Recipe[];
};

const emptyCookbook: CookbookState = {
  savedIds: [],
  extraRecipes: [],
};

export function loadCookbook(): CookbookState {
  if (typeof window === "undefined") return emptyCookbook;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCookbook;
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

export function allRecipes(extras: Recipe[]): Recipe[] {
  const extraIds = new Set(extras.map((recipe) => recipe.id));
  return [...extras, ...RECIPES.filter((recipe) => !extraIds.has(recipe.id))];
}
