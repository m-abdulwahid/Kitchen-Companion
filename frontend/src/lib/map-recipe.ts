import { photoForRecipe } from "./food-photos";
import type { DietTag, Recipe, RecipeSource } from "./types";

const DIET_MAP: Record<string, DietTag> = {
  halal: "halal",
  vegetarian: "vegetarian",
  vegan: "vegan",
  gluten_free: "gluten-free",
};

const COST_BY_DIFFICULTY: Record<string, string> = {
  easy: "$8–12",
  medium: "$12–18",
  hard: "$18–24",
};

type ApiIngredient = {
  name?: string;
  quantity?: number | string;
  unit?: string;
  optional?: boolean;
};

export type ApiRecipe = {
  id?: number | string;
  name?: string;
  title?: string;
  description?: string;
  difficulty?: string;
  meal_type?: string;
  cuisine?: string;
  dietary_tags?: string[];
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  instructions?: string[];
  ingredients?: Array<string | ApiIngredient>;
  image_url?: string;
  image?: string;
};

function formatIngredient(item: string | ApiIngredient) {
  if (typeof item === "string") return item;
  const quantity = item.quantity == null ? "" : String(item.quantity);
  const unit = item.unit ?? "";
  const name = item.name ?? "";
  const optional = item.optional ? " (optional)" : "";
  return [quantity, unit, name].filter(Boolean).join(" ") + optional;
}

function mapDiets(tags: string[] | undefined): DietTag[] {
  return (tags ?? [])
    .map((tag) => DIET_MAP[tag.toLowerCase().replaceAll("-", "_")])
    .filter((tag): tag is DietTag => Boolean(tag));
}

function emojiFor(cuisine?: string, mealType?: string) {
  const key = `${cuisine ?? ""} ${mealType ?? ""}`.toLowerCase();
  if (key.includes("dessert")) return "🍰";
  if (key.includes("breakfast")) return "🍳";
  if (key.includes("japanese")) return "🍜";
  if (key.includes("italian")) return "🍝";
  if (key.includes("mexican")) return "🌮";
  if (key.includes("thai") || key.includes("chinese")) return "🥡";
  if (key.includes("french")) return "🥖";
  return "🍽️";
}

export async function mapApiRecipe(raw: ApiRecipe): Promise<Recipe> {
  const title = raw.name?.trim() || raw.title?.trim() || "Untitled recipe";
  const timeMinutes = Math.max(5, (raw.prep_time ?? 0) + (raw.cook_time ?? 20));
  const imageUrl =
    raw.image_url ||
    raw.image ||
    (await photoForRecipe(title, raw.cuisine, raw.id));
  return {
    id: `api-${raw.id ?? title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    description: raw.description?.trim() || `A ${raw.cuisine ?? "home"} ${raw.meal_type ?? "dish"}.`,
    emoji: emojiFor(raw.cuisine, raw.meal_type),
    imageUrl,
    timeMinutes,
    cost: COST_BY_DIFFICULTY[raw.difficulty ?? ""] ?? "$10–16",
    servings: raw.servings ?? 2,
    diets: mapDiets(raw.dietary_tags),
    ingredients: (raw.ingredients ?? []).map(formatIngredient).filter(Boolean),
    steps: (raw.instructions ?? []).map((step) => step.trim()).filter(Boolean),
    source: "api",
  };
}

export function recipeSourceFromUrl(url: string): RecipeSource {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return "web";
}
