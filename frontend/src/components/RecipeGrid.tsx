import { RecipeCard } from "@/components/RecipeCard";
import type { Recipe } from "@/lib/types";

type RecipeGridProps = {
  recipes: Recipe[];
  savedIds: string[];
  onOpen: (recipe: Recipe) => void;
  emptyMessage: string;
};

export function RecipeGrid({
  recipes,
  savedIds,
  onOpen,
  emptyMessage,
}: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-caramel/40 bg-white/60 px-6 py-16 text-center text-cocoa">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          saved={savedIds.includes(recipe.id)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
