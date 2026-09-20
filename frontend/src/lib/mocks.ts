import { ASSISTANT } from "./assistant";
import type { Recipe } from "./types";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TODO: replace with a real LLM question-answering call (question + recipe + step → spoken answer).
export async function answerCookingQuestion(
  question: string,
  recipe: Recipe,
  stepText: string,
): Promise<string> {
  await wait(800);
  return `${ASSISTANT.name} here! For “${question.trim()}” during ${recipe.title}: stay with this step — ${stepText} If something’s scorching, lower the heat; if it’s shy, give it another minute.`;
}

// TODO: replace with real video ingest + recipe generation from TikTok / Instagram Reels.
export async function generateRecipeFromVideo(url: string): Promise<Recipe> {
  await wait(1400);
  const isTiktok = /tiktok\.com/i.test(url);
  const source = isTiktok ? "tiktok" : "instagram";
  const slug = `upload-${Date.now()}`;
  return {
    id: slug,
    title: isTiktok ? "Reel-Famous Garlic Pasta" : "Saved-From-Stories Salad",
    description:
      "Draft recipe spun up from your video link. Wiring the real model comes next.",
    emoji: isTiktok ? "🍝" : "🥗",
    timeMinutes: isTiktok ? 22 : 15,
    cost: "$9–13",
    servings: 2,
    diets: isTiktok ? ["halal", "vegetarian"] : ["halal", "vegetarian", "vegan", "gluten-free"],
    meal: isTiktok ? "dinner" : "lunch",
    ingredients: isTiktok
      ? ["spaghetti", "garlic", "olive oil", "chili flakes", "parsley", "salt"]
      : ["greens", "cucumber", "tomato", "lemon", "olive oil", "salt"],
    steps: [
      "Watch the video once more and set out the ingredients.",
      "Cook the main element until it looks like the clip.",
      "Season the way the creator did — then taste and adjust.",
      "Plate it cute. You earned the little twirl.",
    ],
    source,
  };
}
