"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  allRecipes,
  emptyCookbook,
  getCookbookSnapshot,
  subscribeCookbook,
  updateCookbook,
} from "@/lib/cookbook-storage";
import type { Recipe } from "@/lib/types";

export function useCookbook() {
  // Server render and hydration see an empty cookbook; the browser then switches to the saved one.
  const state = useSyncExternalStore(
    subscribeCookbook,
    getCookbookSnapshot,
    () => emptyCookbook,
  );

  const recipes = useMemo(
    () => allRecipes(state.extraRecipes),
    [state.extraRecipes],
  );

  const savedRecipes = useMemo(
    () => recipes.filter((recipe) => state.savedIds.includes(recipe.id)),
    [recipes, state.savedIds],
  );

  const isSaved = useCallback(
    (id: string) => state.savedIds.includes(id),
    [state.savedIds],
  );

  const toggleSave = useCallback((recipe: Recipe) => {
    updateCookbook((current) => {
      const saved = current.savedIds.includes(recipe.id);
      return {
        extraRecipes: current.extraRecipes.some((item) => item.id === recipe.id)
          ? current.extraRecipes
          : recipe.source === "kitchen"
            ? current.extraRecipes
            : [...current.extraRecipes, recipe],
        savedIds: saved
          ? current.savedIds.filter((id) => id !== recipe.id)
          : [...current.savedIds, recipe.id],
      };
    });
  }, []);

  const addGeneratedRecipe = useCallback((recipe: Recipe) => {
    updateCookbook((current) => ({
      extraRecipes: [
        recipe,
        ...current.extraRecipes.filter((item) => item.id !== recipe.id),
      ],
      savedIds: current.savedIds.includes(recipe.id)
        ? current.savedIds
        : [recipe.id, ...current.savedIds],
    }));
  }, []);

  return {
    recipes,
    savedRecipes,
    isSaved,
    toggleSave,
    addGeneratedRecipe,
  };
}
