import { NextResponse } from "next/server";
import { mapApiRecipe, type ApiRecipe } from "@/lib/map-recipe";
import { getRecipeById } from "@/lib/recipes";
import { loadRootEnv } from "@/lib/server-env";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  loadRootEnv();
  const { id } = await context.params;
  const apiId = id.replace(/^api-/, "");
  const local = getRecipeById(id);
  if (local) return NextResponse.json({ recipe: local });

  const key = process.env.RECIPE_API_KEY;
  if (!key || !/^\d+$/.test(apiId)) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const response = await fetch(`https://recipeapi.io/api/v1/recipes/${apiId}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  const payload = (await response.json()) as { data?: ApiRecipe };
  if (!payload.data) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }
  return NextResponse.json({ recipe: await mapApiRecipe(payload.data) });
}
