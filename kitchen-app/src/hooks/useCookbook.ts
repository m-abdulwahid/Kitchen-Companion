"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allRecipes,
  loadCookbook,
  saveCookbook,
  type CookbookState,
} from "@/lib/cookbook-storage";
import type { Recipe } from "@/lib/types";

export function useCookbook() {
  const [state, setState] = useState<CookbookState>({
    savedIds: [],
    extraRecipes: [],
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(loadCookbook());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveCookbook(state);
  }, [ready, state]);

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
    setState((current) => {
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
    setState((current) => ({
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
    ready,
    recipes,
    savedRecipes,
    isSaved,
    toggleSave,
    addGeneratedRecipe,
  };
}
