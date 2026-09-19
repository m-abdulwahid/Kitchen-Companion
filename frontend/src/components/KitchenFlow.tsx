"use client";

import { useState, useSyncExternalStore } from "react";
import { CookingView } from "@/components/CookingView";
import { RecipeBrowser } from "@/components/RecipeBrowser";
import { RecipeDetail } from "@/components/RecipeDetail";
import { useCookbook } from "@/hooks/useCookbook";
import type { Recipe } from "@/lib/types";

type KitchenFlowProps = {
  mode: "explore" | "cookbook";
};

// The ?recipe=<id> from a shared link. Read as an external value (null while rendering on the server).
function readSharedId() {
  return new URLSearchParams(window.location.search).get("recipe");
}
const neverChanges = () => () => {};

export function KitchenFlow({ mode }: KitchenFlowProps) {
  const cookbook = useCookbook();
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [leftSharedRecipe, setLeftSharedRecipe] = useState(false);
  const [cooking, setCooking] = useState(false);

  const list = mode === "cookbook" ? cookbook.savedRecipes : cookbook.recipes;

  // A shared link opens its recipe until the user goes back to browsing.
  const sharedId = useSyncExternalStore(neverChanges, readSharedId, () => null);
  const sharedRecipe =
    sharedId && !leftSharedRecipe
      ? (cookbook.recipes.find((recipe) => recipe.id === sharedId) ?? null)
      : null;
  const selected = picked ?? sharedRecipe;

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
        onBack={() => {
          setPicked(null);
          setLeftSharedRecipe(true);
        }}
        onSave={() => cookbook.toggleSave(selected)}
        onStartCooking={() => setCooking(true)}
      />
    );
  }

  return (
    <RecipeBrowser
      recipes={list}
      savedIds={cookbook.savedRecipes.map((recipe) => recipe.id)}
      onOpen={setPicked}
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
