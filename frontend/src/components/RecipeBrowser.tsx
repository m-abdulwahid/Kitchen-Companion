"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RecipeGrid } from "@/components/RecipeGrid";
import { filterAndSortRecipes, type MealFilter } from "@/lib/recipe-search";
import type { DietTag, Recipe } from "@/lib/types";

const DIETS: { id: DietTag; label: string }[] = [
  { id: "halal", label: "Halal" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten free" },
];

const MEALS: { id: MealFilter; label: string }[] = [
  { id: "all", label: "All meals" },
  { id: "breakfast", label: "Breakfast" },
  { id: "snack", label: "Snacks" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
];

type RecipeBrowserProps = {
  recipes: Recipe[];
  savedIds: string[];
  onOpen: (recipe: Recipe) => void;
  heading: string;
  subheading: string;
  emptyMessage: ReactNode;
};

export function RecipeBrowser({
  recipes,
  savedIds,
  onOpen,
  heading,
  subheading,
  emptyMessage,
}: RecipeBrowserProps) {
  const [query, setQuery] = useState("");
  const [diets, setDiets] = useState<DietTag[]>([]);
  const [meal, setMeal] = useState<MealFilter>("all");

  const shown = useMemo(
    () => filterAndSortRecipes(recipes, query, diets, meal),
    [diets, meal, query, recipes],
  );

  function toggleDiet(diet: DietTag) {
    setDiets((current) =>
      current.includes(diet)
        ? current.filter((item) => item !== diet)
        : [...current, diet],
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl text-espresso sm:text-5xl">{heading}</h1>
        <p className="mt-2 max-w-2xl text-cocoa/80">{subheading}</p>
      </div>
      <div className="mb-6 rounded-[2rem] bg-white/80 p-4 shadow-[0_8px_24px_rgba(107,63,42,0.06)]">
        <label className="block text-sm font-semibold text-cocoa">
          Search recipes or ingredients
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="grilled cheese, oats, chickpeas…"
            className="mt-2 w-full rounded-2xl border border-peach bg-cream px-4 py-3 text-base text-espresso outline-none ring-tomato/30 placeholder:text-caramel/70 focus:ring-4"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {MEALS.map((option) => {
            const on = meal === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMeal(option.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  on
                    ? "bg-espresso text-cream"
                    : "bg-cream text-cocoa ring-1 ring-peach hover:bg-peach"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {DIETS.map((diet) => {
            const on = diets.includes(diet.id);
            return (
              <button
                key={diet.id}
                type="button"
                onClick={() => toggleDiet(diet.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  on
                    ? "bg-tomato text-cream"
                    : "bg-peach/70 text-cocoa hover:bg-peach"
                }`}
              >
                {diet.label}
              </button>
            );
          })}
        </div>
      </div>
      <RecipeGrid
        recipes={shown}
        savedIds={savedIds}
        onOpen={onOpen}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
