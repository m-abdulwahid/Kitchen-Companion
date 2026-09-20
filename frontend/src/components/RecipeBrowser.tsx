"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FilterDropdown } from "@/components/FilterDropdown";
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
  { id: "dessert", label: "Dessert" },
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

  const mealLabel = MEALS.find((option) => option.id === meal)?.label ?? "All meals";
  const dietSummary =
    diets.length === 0
      ? "Any diet"
      : diets
          .map((diet) => DIETS.find((item) => item.id === diet)?.label)
          .filter(Boolean)
          .join(", ");

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
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <FilterDropdown label="Meal" summary={mealLabel}>
            {MEALS.map((option) => {
              const on = meal === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMeal(option.id)}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                    on ? "bg-espresso text-cream" : "text-cocoa hover:bg-cream"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </FilterDropdown>
          <FilterDropdown label="Dietary restrictions" summary={dietSummary}>
            <button
              type="button"
              onClick={() => setDiets([])}
              className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                diets.length === 0 ? "bg-espresso text-cream" : "text-cocoa hover:bg-cream"
              }`}
            >
              Any diet
            </button>
            {DIETS.map((diet) => {
              const on = diets.includes(diet.id);
              return (
                <label
                  key={diet.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                    on ? "bg-peach/80 text-espresso" : "text-cocoa hover:bg-cream"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleDiet(diet.id)}
                    className="accent-tomato"
                  />
                  {diet.label}
                </label>
              );
            })}
          </FilterDropdown>
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
