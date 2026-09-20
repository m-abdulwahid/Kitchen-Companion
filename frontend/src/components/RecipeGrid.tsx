import type { ReactNode } from "react";
import { RecipeCard } from "@/components/RecipeCard";
import type { Recipe } from "@/lib/types";

type RecipeGridProps = {
  recipes: Recipe[];
  onOpen: (recipe: Recipe) => void;
  emptyMessage: ReactNode;
};

export function RecipeGrid({ recipes, onOpen, emptyMessage }: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="px-2 py-16 text-center text-cocoa/70">{emptyMessage}</div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} onOpen={onOpen} />
      ))}
    </div>
  );
}
