import { NextResponse } from "next/server";
import { mapApiRecipe, type ApiRecipe } from "@/lib/map-recipe";
import { RECIPES } from "@/lib/recipes";
import { loadRootEnv } from "@/lib/server-env";
import type { DietTag } from "@/lib/types";

export const runtime = "nodejs";

function dietParam(value: string | null) {
  if (!value) return null;
  if (value === "gluten-free") return "gluten_free";
  return value;
}

export async function GET(request: Request) {
  loadRootEnv();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const ingredients = searchParams.get("ingredients")?.trim() ?? "";
  const dietary = dietParam(searchParams.get("dietary_tags"));
  const key = process.env.RECIPE_API_KEY;

  if (!key) {
    return NextResponse.json({
      recipes: filterLocal(search, ingredients, searchParams.get("dietary_tags")),
      source: "local",
    });
  }

  const params = new URLSearchParams({ per_page: "24" });
  if (ingredients) params.set("ingredients", ingredients);
  else if (search) {
    params.set("search", search);
    params.set("search_in", "both");
  }
  if (dietary) params.set("dietary_tags", dietary);

  try {
    const response = await fetch(
      `https://recipeapi.io/api/v1/recipes?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        next: { revalidate: 120 },
      },
    );
    if (!response.ok) {
      throw new Error(`Recipe API ${response.status}`);
    }
    const payload = (await response.json()) as { data?: ApiRecipe[] };
    const recipes = (await Promise.all((payload.data ?? []).map(mapApiRecipe))).filter(
      (recipe) => recipe.steps.length > 0 && recipe.ingredients.length > 0,
    );
    return NextResponse.json({ recipes, source: "api" });
  } catch {
    return NextResponse.json({
      recipes: filterLocal(search, ingredients, searchParams.get("dietary_tags")),
      source: "local",
    });
  }
}

function filterLocal(search: string, ingredients: string, diet: string | null) {
  const needle = (ingredients || search).toLowerCase();
  return RECIPES.filter((recipe) => {
    const matchesDiet = !diet || recipe.diets.includes(diet as DietTag);
    const haystack = [recipe.title, recipe.description, ...recipe.ingredients]
      .join(" ")
      .toLowerCase();
    return matchesDiet && (!needle || haystack.includes(needle));
  });
}
