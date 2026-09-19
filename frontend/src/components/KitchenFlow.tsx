"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CookingView } from "@/components/CookingView";
import { RecipeBrowser } from "@/components/RecipeBrowser";
import { RecipeDetail } from "@/components/RecipeDetail";
import { useCookbook } from "@/hooks/useCookbook";
import type { Recipe } from "@/lib/types";

type KitchenFlowProps = {
  mode: "explore" | "cookbook";
};

function readSharedId() {
  return new URLSearchParams(window.location.search).get("recipe");
}
const neverChanges = () => () => {};

export function KitchenFlow({ mode }: KitchenFlowProps) {
  const cookbook = useCookbook();
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [sharedRecipe, setSharedRecipe] = useState<Recipe | null>(null);
  const [leftSharedRecipe, setLeftSharedRecipe] = useState(false);
  const [cooking, setCooking] = useState(false);

  const list = mode === "cookbook" ? cookbook.savedRecipes : cookbook.recipes;
  const sharedId = useSyncExternalStore(neverChanges, readSharedId, () => null);

  useEffect(() => {
    if (!sharedId || leftSharedRecipe) {
      setSharedRecipe(null);
      return;
    }
    const local =
      cookbook.recipes.find((recipe) => recipe.id === sharedId) ?? null;
    if (local) {
      setSharedRecipe(local);
      return;
    }
    let cancelled = false;
    fetch(`/api/recipes/${encodeURIComponent(sharedId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { recipe?: Recipe } | null) => {
        if (!cancelled && data?.recipe) setSharedRecipe(data.recipe);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cookbook.recipes, leftSharedRecipe, sharedId]);

  const selected = picked ?? (leftSharedRecipe ? null : sharedRecipe);

  if (cooking && selected) {
    return <CookingView recipe={selected} onExit={() => setCooking(false)} />;
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
      live={mode === "explore"}
      heading={mode === "cookbook" ? "My cookbook" : "What’s cooking?"}
      subheading={
        mode === "cookbook"
          ? "Everything you saved — still searchable by ingredient and diet."
          : "Pick a dish, then cook live with Remy in your ear and the camera on the pan."
      }
      emptyMessage={
        mode === "cookbook"
          ? "Your cookbook is empty. Save a recipe from Explore or generate one from a video."
          : "No matches. Try another search or fewer diet filters."
      }
    />
  );
}
