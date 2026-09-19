"use client";

import { useState, type FormEvent } from "react";
import { Pip } from "@/components/Pip";
import { RecipeDetail } from "@/components/RecipeDetail";
import { CookingView } from "@/components/CookingView";
import { useCompanion } from "@/hooks/useCompanion";
import { useCookbook } from "@/hooks/useCookbook";
import { generateRecipeFromVideo } from "@/lib/mocks";
import type { Recipe } from "@/lib/types";

export function UploadFlow() {
  const cookbook = useCookbook();
  const { companion } = useCompanion();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState(false);

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/tiktok\.com|instagram\.com/i.test(url)) {
      setError("Paste a TikTok or Instagram Reels link for now.");
      return;
    }
    setBusy(true);
    const generated = await generateRecipeFromVideo(url);
    cookbook.addGeneratedRecipe(generated);
    setRecipe(generated);
    setBusy(false);
  }

  if (cooking && recipe) {
    return <CookingView recipe={recipe} onExit={() => setCooking(false)} />;
  }

  if (recipe) {
    return (
      <RecipeDetail
        recipe={recipe}
        saved={cookbook.isSaved(recipe.id)}
        onBack={() => setRecipe(null)}
        onSave={() => cookbook.toggleSave(recipe)}
        onStartCooking={() => setCooking(true)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl text-espresso sm:text-5xl">
        Pull a recipe from a video
      </h1>
      <p className="mt-3 text-cocoa/80">
        Drop a TikTok or Instagram Reels URL. {companion.name} drafts the
        ingredients, time, cost, and steps — then you can save it to your
        cookbook.
      </p>
      <form
        onSubmit={onGenerate}
        className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_12px_32px_rgba(107,63,42,0.08)]"
      >
        <label className="block text-sm font-semibold text-cocoa">
          Video link
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.tiktok.com/@chef/video/…"
            className="mt-2 w-full rounded-2xl border border-peach bg-cream px-4 py-3 outline-none ring-tomato/30 focus:ring-4"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-raspberry">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-full bg-tomato px-5 py-3 font-display text-lg text-cream disabled:opacity-60"
        >
          {busy ? `${companion.name} is watching the clip…` : "Generate recipe"}
        </button>
      </form>
      <div className="mt-6">
        <Pip message="Real video parsing is still a TODO. This mock still saves a draft so you can try the rest of the flow." />
      </div>
    </div>
  );
}
