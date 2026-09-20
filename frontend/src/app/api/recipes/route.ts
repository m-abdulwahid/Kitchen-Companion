import { NextResponse } from "next/server";
import { filterAndSortRecipes, type RecipeSort } from "@/lib/recipe-search";
import { RECIPES } from "@/lib/recipes";
import type { DietTag } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const dietary = searchParams.get("dietary_tags");
  const sort = (searchParams.get("sort") as RecipeSort) || "relevance";
  const diets = dietary ? [dietary as DietTag] : [];
  const recipes = filterAndSortRecipes(RECIPES, search, diets, sort);
  return NextResponse.json({ recipes, source: "local" });
}
