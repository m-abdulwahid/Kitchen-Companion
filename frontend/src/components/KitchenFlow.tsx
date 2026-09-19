"use client";

import { useEffect, useState } from "react";
import { CookingView } from "@/components/CookingView";
import { RecipeBrowser } from "@/components/RecipeBrowser";
import { RecipeDetail } from "@/components/RecipeDetail";
import { useCookbook } from "@/hooks/useCookbook";
import type { Recipe } from "@/lib/types";

type KitchenFlowProps = {
  mode: "explore" | "cookbook";
};

export function KitchenFlow({ mode }: KitchenFlowProps) {
  const cookbook = useCookbook();
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState(false);

  const list = mode === "cookbook" ? cookbook.savedRecipes : cookbook.recipes;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("recipe");
    if (!sharedId || !cookbook.ready) return;
    const match = cookbook.recipes.find((recipe) => recipe.id === sharedId);
    if (match) {
      setSelected(match);
      setCooking(false);
    }
  }, [cookbook.ready, cookbook.recipes]);

  if (cooking && selected) {
    return (
      <CookingView
        recipe={selected}
        onExit={() => setCooking(false)}
      />
    );
  }

  if (selected) {
    return (
      <RecipeDetail
        recipe={selected}
        saved={cookbook.isSaved(selected.id)}
        onBack={() => setSelected(null)}
        onSave={() => cookbook.toggleSave(selected)}
        onStartCooking={() => setCooking(true)}
      />
    );
  }

  return (
    <RecipeBrowser
      recipes={list}
      savedIds={cookbook.savedRecipes.map((recipe) => recipe.id)}
      onOpen={setSelected}
      heading={mode === "cookbook" ? "My cookbook" : "What’s cooking?"}
      subheading={
        mode === "cookbook"
          ? "Everything you saved — still searchable by ingredient and diet."
          : "Peek the grid, pick a recipe, then cook live with camera, voice, and Pip in your ear."
      }
      emptyMessage={
        mode === "cookbook"
          ? "Your cookbook is empty. Save a recipe from Explore or generate one from a Reel."
          : "No matches. Try another ingredient or fewer diet filters."
      }
    />
  );
}
