"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RecipeGrid } from "@/components/RecipeGrid";
import { filterAndSortRecipes, type MealFilter } from "@/lib/recipe-search";
import type { Recipe } from "@/lib/types";

const MEALS: { id: MealFilter; label: string }[] = [
  { id: "all", label: "All meals" },
  { id: "breakfast", label: "Breakfast" },
  { id: "snack", label: "Snacks" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "dessert", label: "Dessert" },
];

type RecipeBrowserProps = {
  recipes: Recipe[];
  onOpen: (recipe: Recipe) => void;
  heading: string;
  emptyMessage: ReactNode;
};

export function RecipeBrowser({
  recipes,
  onOpen,
  heading,
  emptyMessage,
}: RecipeBrowserProps) {
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<MealFilter>("all");

  const shown = useMemo(
    () => filterAndSortRecipes(recipes, query, [], meal),
    [meal, query, recipes],
  );

  return (
    <div>
      <h1 className="mb-6 font-display text-4xl text-espresso sm:text-5xl">{heading}</h1>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search recipes"
          aria-label="Search recipes"
          className="w-full rounded-2xl border border-peach bg-white px-4 py-3 text-base text-espresso outline-none ring-tomato/30 placeholder:text-caramel/70 focus:ring-4 sm:flex-1"
        />
        <select
          value={meal}
          onChange={(event) => setMeal(event.target.value as MealFilter)}
          aria-label="Meal"
          className="rounded-2xl border border-peach bg-white px-4 py-3 text-sm font-semibold text-espresso sm:w-44"
        >
          {MEALS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <RecipeGrid recipes={shown} onOpen={onOpen} emptyMessage={emptyMessage} />
    </div>
  );
}
