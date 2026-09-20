import { NextResponse } from "next/server";
import { inferMeal, recipeSourceFromUrl } from "@/lib/map-recipe";
import { loadRootEnv } from "@/lib/server-env";
import type { Recipe } from "@/lib/types";

export const runtime = "nodejs";

const COOKING_GURU = "https://cooking.guru/recipe-extractor-from-video";
const VIDEO_HOST =
  /tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|pinterest\.com|pin\.it|xiaohongshu\.com|xhslink\.com/i;

type ExtractBody = { url?: string };

export async function POST(request: Request) {
  loadRootEnv();
  const body = (await request.json().catch(() => null)) as ExtractBody | null;
  const url = body?.url?.trim() ?? "";
  if (!isPublicHttpUrl(url)) {
    return NextResponse.json({ error: "Paste a public http(s) video or recipe link." }, { status: 400 });
  }

  const cookingGuruUrl = COOKING_GURU;
  const isVideo = VIDEO_HOST.test(url);

  if (!isVideo) {
    const fromPage = await extractFromWebPage(url);
    if (fromPage) {
      return NextResponse.json({ recipe: fromPage, cookingGuruUrl });
    }
  }

  const meta = await fetchVideoMeta(url);
  const omniRecipe = await generateWithOmni(url, meta);
  if (omniRecipe) {
    return NextResponse.json({
      recipe: omniRecipe,
      cookingGuruUrl,
      usedCookingGuru: false,
    });
  }

  if (meta) {
    return NextResponse.json({
      recipe: stubFromMeta(url, meta),
      cookingGuruUrl,
      usedCookingGuru: false,
    });
  }

  return NextResponse.json({
    error:
      "Could not read that link here. CookingGuru can extract the recipe from the video — your link is ready to paste.",
    cookingGuruUrl,
  }, { status: 422 });
}

function isPublicHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function extractFromWebPage(url: string): Promise<Recipe | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "WhiskerRecipeBot/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const blocks = [
      ...html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    for (const block of blocks) {
      const recipe = recipeFromJsonLd(block[1], url);
      if (recipe) return recipe;
    }
  } catch {
    return null;
  }
  return null;
}

function recipeFromJsonLd(raw: string, url: string): Recipe | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const nodes = flattenLd(parsed);
    const recipe = nodes.find((node) => {
      const type = (node as { "@type"?: unknown })["@type"];
      return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
    }) as Record<string, unknown> | undefined;
    if (!recipe) return null;
    const title = String(recipe.name ?? "Imported recipe");
    const ingredients = asStringList(recipe.recipeIngredient);
    const steps = asInstructionList(recipe.recipeInstructions);
    if (ingredients.length === 0 && steps.length === 0) return null;
    const image = firstImage(recipe.image);
    const totalTime = parseIsoDuration(recipe.totalTime) ?? 25;
    return {
      id: `web-${Date.now()}`,
      title,
      description: String(recipe.description ?? `Imported from ${new URL(url).hostname}`),
      emoji: "📝",
      imageUrl: image,
      timeMinutes: totalTime,
      cost: "$10–16",
      servings: Number.parseInt(String(recipe.recipeYield ?? "2"), 10) || 2,
      diets: [],
      meal: inferMeal(title),
      ingredients: ingredients.length ? ingredients : ["See the original page for amounts."],
      steps: steps.length ? steps : ["Follow the method on the original page."],
      source: "web",
      videoUrl: url,
    };
  } catch {
    return null;
  }
}

function flattenLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenLd);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) return record["@graph"];
  }
  return value ? [value] : [];
}

function asStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function asInstructionList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) {
    if (typeof value === "object" && value && "text" in value) {
      return [String((value as { text: string }).text)];
    }
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) {
        return String((item as { text: string }).text);
      }
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstImage(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstImage(value[0]);
  if (typeof value === "object" && value && "url" in value) {
    return String((value as { url: string }).url);
  }
  return undefined;
}

function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

type VideoMeta = { title: string; author?: string; thumbnail?: string };

async function fetchVideoMeta(url: string): Promise<VideoMeta | null> {
  const endpoints = [
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      if (data.title) {
        return {
          title: data.title,
          author: data.author_name,
          thumbnail: data.thumbnail_url,
        };
      }
    } catch {
      // try the next oEmbed provider
    }
  }
  return null;
}

function stubFromMeta(url: string, meta: VideoMeta): Recipe {
  return {
    id: `upload-${Date.now()}`,
    title: tidyTitle(meta.title),
    description: meta.author
      ? `From ${meta.author}. Open CookingGuru if you want the full extracted method.`
      : "Drafted from the video title. Use CookingGuru for a full extract.",
    emoji: "🎬",
    imageUrl: meta.thumbnail,
    timeMinutes: 25,
    cost: "$10–16",
    servings: 2,
    diets: [],
    meal: inferMeal(tidyTitle(meta.title)),
    ingredients: ["Ingredients from the video — check CookingGuru if this list is thin."],
    steps: [
      "Set out everything you saw in the clip.",
      "Cook the main element the way the creator did.",
      "Taste, season, and plate.",
    ],
    source: recipeSourceFromUrl(url),
    videoUrl: url,
  };
}

function tidyTitle(title: string) {
  return title.replace(/\s*[|#].*$/, "").trim() || "Recipe from video";
}

async function generateWithOmni(url: string, meta: VideoMeta | null): Promise<Recipe | null> {
  const key = process.env.OMNI_KEY;
  const base = (process.env.OMNI_BASE_URL ?? "https://yibuapi.com/v1").replace(/\/$/, "");
  const model = process.env.OMNI_MODEL ?? "qwen3.5-omni-flash";
  if (!key || !meta?.title) return null;

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You turn cooking video titles into a cookable recipe. Reply with JSON only: {\"title\",\"description\",\"timeMinutes\",\"servings\",\"ingredients\":[],\"steps\":[]}. No markdown.",
          },
          {
            role: "user",
            content: `Video: ${url}\nTitle: ${meta.title}\nCreator: ${meta.author ?? "unknown"}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const json = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    const ingredients = asStringList(json.ingredients);
    const steps = asStringList(json.steps);
    if (ingredients.length < 2 || steps.length < 2) return null;
    return {
      id: `upload-${Date.now()}`,
      title: String(json.title ?? tidyTitle(meta.title)),
      description: String(json.description ?? `From the video “${meta.title}”.`),
      emoji: "🎬",
      imageUrl: meta.thumbnail,
      timeMinutes: Number(json.timeMinutes) || 25,
      cost: "$10–16",
      servings: Number(json.servings) || 2,
      diets: [],
      meal: inferMeal(String(json.title ?? tidyTitle(meta.title))),
      ingredients,
      steps,
      source: recipeSourceFromUrl(url),
      videoUrl: url,
    };
  } catch {
    return null;
  }
}
