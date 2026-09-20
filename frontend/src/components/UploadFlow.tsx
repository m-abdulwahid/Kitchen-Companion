"use client";

import { useState, type FormEvent } from "react";
import { CookingView } from "@/components/CookingView";
import { Ella } from "@/components/Ella";
import { RecipeDetail } from "@/components/RecipeDetail";
import { useCookbook } from "@/hooks/useCookbook";
import type { Recipe } from "@/lib/types";

const COOKING_GURU = "https://cooking.guru/recipe-extractor-from-video";

export function UploadFlow() {
  const cookbook = useCookbook();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guruHint, setGuruHint] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState(false);

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setGuruHint(false);
    if (!url.trim()) {
      setError("Paste a video or recipe-page link — Ella will take it from there.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await response.json()) as {
        recipe?: Recipe;
        error?: string;
      };
      if (!response.ok || !data.recipe) {
        setError(data.error ?? "That clip slipped the whisk.");
        setGuruHint(true);
        return;
      }
      cookbook.addGeneratedRecipe(data.recipe);
      setRecipe(data.recipe);
    } catch {
      setError("That clip slipped the whisk.");
      setGuruHint(true);
    } finally {
      setBusy(false);
    }
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
        Paste a TikTok, Reel, YouTube Short, or recipe-page URL. Whisk-Ella
        drafts the dish so you can cook it with Ella by your side.
      </p>
      <form
        onSubmit={onGenerate}
        className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_12px_32px_rgba(107,63,42,0.08)]"
      >
        <label className="block text-sm font-semibold text-cocoa">
          Video or recipe link
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
          {busy ? "Ella’s watching the clip…" : "Generate recipe"}
        </button>
        {guruHint ? (
          <p className="mt-3 text-sm text-caramel">
            If the clip won&apos;t parse,{" "}
            <a
              href={COOKING_GURU}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-tomato hover:underline"
            >
              try CookingGuru
            </a>{" "}
            — I&apos;ll still cook whatever you bring back.
          </p>
        ) : null}
      </form>
      <div className="mt-6">
        <Ella message="If the clip won't parse, try CookingGuru — I'll still cook whatever you bring back." />
      </div>
    </div>
  );
}
