import { NextResponse } from "next/server";
import { filterAndSortRecipes, type MealFilter } from "@/lib/recipe-search";
import { RECIPES } from "@/lib/recipes";
import type { DietTag } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const dietary = searchParams.get("dietary_tags");
  const meal = (searchParams.get("meal") as MealFilter) || "all";
  const diets = dietary ? [dietary as DietTag] : [];
  const recipes = filterAndSortRecipes(RECIPES, search, diets, meal);
  return NextResponse.json({ recipes, source: "local" });
}
