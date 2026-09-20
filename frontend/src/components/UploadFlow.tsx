"use client";

import { useState, type FormEvent } from "react";
import { CookingView } from "@/components/CookingView";
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
      setError("Paste a link first.");
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
        setError(data.error ?? "Couldn’t extract that recipe.");
        setGuruHint(true);
        return;
      }
      cookbook.addGeneratedRecipe(data.recipe);
      setRecipe(data.recipe);
    } catch {
      setError("Couldn’t extract that recipe.");
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
      <h1 className="font-display text-4xl text-espresso sm:text-5xl">Upload</h1>
      <form
        onSubmit={onGenerate}
        className="mt-8"
      >
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a video or recipe link"
          aria-label="Video or recipe link"
          className="w-full rounded-2xl border border-peach bg-white px-4 py-3 outline-none ring-tomato/30 focus:ring-4"
        />
        {error ? <p className="mt-2 text-sm text-raspberry">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-full bg-tomato px-5 py-3 font-display text-lg text-cream disabled:opacity-60"
        >
          {busy ? "Working…" : "Generate recipe"}
        </button>
        {guruHint ? (
          <p className="mt-3 text-sm text-caramel">
            <a
              href={COOKING_GURU}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-tomato hover:underline"
            >
              Try CookingGuru
            </a>
          </p>
        ) : null}
      </form>
    </div>
  );
}
