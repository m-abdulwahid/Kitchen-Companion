import type { Recipe } from "@/lib/types";

type RecipeCardProps = {
  recipe: Recipe;
  saved?: boolean;
  onOpen: (recipe: Recipe) => void;
};

const dietLabel: Record<string, string> = {
  halal: "halal",
  vegetarian: "veggie",
  vegan: "vegan",
  "gluten-free": "GF",
};

export function RecipeCard({ recipe, saved, onOpen }: RecipeCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(recipe)}
      className="group flex h-full flex-col rounded-[1.6rem] border border-white/80 bg-white p-4 text-left shadow-[0_10px_30px_rgba(107,63,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(232,93,76,0.18)]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-peach text-3xl">
          {recipe.emoji}
        </span>
        {saved ? (
          <span className="rounded-full bg-blush/40 px-2 py-1 text-xs font-semibold text-raspberry">
            saved
          </span>
        ) : null}
      </div>
      <h3 className="font-display text-xl text-espresso">{recipe.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-cocoa/80">
        {recipe.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-peach px-2.5 py-1 text-cocoa">
          {recipe.timeMinutes} min
        </span>
        <span className="rounded-full bg-cream px-2.5 py-1 text-caramel">
          {recipe.cost}
        </span>
        {recipe.diets.map((diet) => (
          <span
            key={diet}
            className="rounded-full bg-raspberry/10 px-2.5 py-1 text-raspberry"
          >
            {dietLabel[diet]}
          </span>
        ))}
      </div>
      <p className="mt-auto pt-4 text-xs text-caramel group-hover:text-tomato">
        {recipe.ingredients.slice(0, 3).join(" · ")}
        {recipe.ingredients.length > 3 ? "…" : ""}
      </p>
    </button>
  );
}
