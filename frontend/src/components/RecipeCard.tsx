import type { Recipe } from "@/lib/types";

type RecipeCardProps = {
  recipe: Recipe;
  onOpen: (recipe: Recipe) => void;
};

export function RecipeCard({ recipe, onOpen }: RecipeCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(recipe)}
      className="group flex h-full flex-col overflow-hidden rounded-[1.6rem] bg-white text-left shadow-[0_10px_30px_rgba(107,63,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(232,93,76,0.18)]"
    >
      <div className="aspect-[4/3] overflow-hidden bg-peach">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-5xl">{recipe.emoji}</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-xl text-espresso">{recipe.title}</h3>
        <p className="mt-1 text-sm text-caramel">{recipe.timeMinutes} min</p>
      </div>
    </button>
  );
}
