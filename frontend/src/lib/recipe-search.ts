import type { DietTag, Meal, Recipe } from "./types";

export type MealFilter = "all" | Meal;

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function scoreRecipe(recipe: Recipe, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  const title = recipe.title.toLowerCase();
  const description = recipe.description.toLowerCase();
  const ingredients = recipe.ingredients.join(" ").toLowerCase();
  if (title === needle) return 100;
  if (title.includes(needle)) return 88;
  const words = tokens(needle);
  if (words.length === 0) return 0;
  const titleWords = tokens(title);
  const titleHits = words.filter((word) => titleWords.includes(word)).length;
  if (titleHits === words.length) return 80;
  if (titleHits > 0) return 55 + titleHits * 8;
  if (description.includes(needle)) return 42;
  const ingredientHits = words.filter((word) => ingredients.includes(word)).length;
  if (ingredientHits === words.length) return 36;
  if (ingredientHits > 0) return 18 + ingredientHits * 4;
  return 0;
}

export function filterAndSortRecipes(
  recipes: Recipe[],
  query: string,
  diets: DietTag[],
  meal: MealFilter,
): Recipe[] {
  const scored = recipes
    .filter((recipe) => diets.every((diet) => recipe.diets.includes(diet)))
    .filter((recipe) => meal === "all" || recipe.meal === meal)
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, query) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.recipe.timeMinutes - b.recipe.timeMinutes;
  });

  return scored.map((entry) => entry.recipe);
}
