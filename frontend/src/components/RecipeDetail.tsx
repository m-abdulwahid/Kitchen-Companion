"use client";

import { useState } from "react";
import { Pip } from "@/components/Pip";
import { ASSISTANT } from "@/lib/assistant";
import type { Recipe } from "@/lib/types";

type RecipeDetailProps = {
  recipe: Recipe;
  saved: boolean;
  onBack: () => void;
  onSave: () => void;
  onStartCooking: () => void;
};

export function RecipeDetail({
  recipe,
  saved,
  onBack,
  onSave,
  onStartCooking,
}: RecipeDetailProps) {
  const [copied, setCopied] = useState(false);

  async function copyShareLink() {
    const url = `${window.location.origin}/?recipe=${recipe.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_12px_40px_rgba(107,63,42,0.1)]">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm font-semibold text-caramel hover:text-tomato"
        >
          ← back to recipes
        </button>
        <div className="flex items-start gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-peach text-4xl">
            {recipe.emoji}
          </span>
          <div>
            <h1 className="font-display text-4xl text-espresso">{recipe.title}</h1>
            <p className="mt-2 max-w-xl text-cocoa/80">{recipe.description}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full bg-peach px-3 py-1">{recipe.timeMinutes} min</span>
          <span className="rounded-full bg-cream px-3 py-1">{recipe.cost}</span>
          <span className="rounded-full bg-blush/30 px-3 py-1">
            {recipe.servings} servings
          </span>
          {recipe.diets.map((diet) => (
            <span key={diet} className="rounded-full bg-raspberry/10 px-3 py-1 text-raspberry">
              {diet}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStartCooking}
            className="rounded-full bg-tomato px-5 py-3 font-display text-lg text-cream shadow hover:bg-raspberry"
          >
            Start cooking with {ASSISTANT.name}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-full border-2 border-peach px-5 py-3 font-semibold text-cocoa hover:bg-peach"
          >
            {saved ? "Saved in cookbook" : "Save to cookbook"}
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            className="rounded-full bg-cream px-5 py-3 font-semibold text-caramel hover:text-tomato"
          >
            {copied ? "Link copied!" : "Copy share link"}
          </button>
        </div>
        <h2 className="mt-8 font-display text-2xl text-espresso">Ingredients</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {recipe.ingredients.map((item) => (
            <li
              key={item}
              className="rounded-2xl bg-cream px-3 py-2 text-sm text-cocoa"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-[2rem] bg-cocoa p-6 text-cream">
          <h2 className="font-display text-2xl">Steps</h2>
          <ol className="mt-4 space-y-3">
            {recipe.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tomato font-display">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <Pip message="I’ll watch the pan, talk you through it, and answer when you shout a question. Camera on, chef." />
      </div>
    </article>
  );
}
