"use client";

import { Ella } from "@/components/Ella";
import { IngredientList } from "@/components/IngredientList";
import { RecipeOverflowMenu } from "@/components/RecipeOverflowMenu";
import type { Recipe } from "@/lib/types";
import { useState } from "react";

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
      <div className="relative overflow-hidden rounded-[2rem] bg-white shadow-[0_12px_40px_rgba(107,63,42,0.1)]">
        <div className="relative">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt=""
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[16/10] place-items-center bg-peach text-7xl">
              {recipe.emoji}
            </div>
          )}
          <button
            type="button"
            onClick={onBack}
            className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-caramel shadow-sm hover:text-tomato"
          >
            ← back
          </button>
          <RecipeOverflowMenu
            saved={saved}
            copied={copied}
            onSave={onSave}
            onShare={copyShareLink}
          />
        </div>
        <div className="p-6">
          <h1 className="font-display text-4xl text-espresso">{recipe.title}</h1>
          <p className="mt-2 max-w-xl text-cocoa/80">{recipe.description}</p>
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
          <button
            type="button"
            onClick={onStartCooking}
            className="mt-6 rounded-full bg-tomato px-6 py-3 font-display text-lg text-cream shadow hover:bg-raspberry"
          >
            Let&apos;s get cooking!
          </button>
          <h2 className="mt-8 font-display text-2xl text-espresso">Ingredients</h2>
          <IngredientList ingredients={recipe.ingredients} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-[2rem] bg-cocoa p-6 text-cream">
          <h2 className="font-display text-2xl">Steps</h2>
          <ol className="mt-4 space-y-3">
            {recipe.steps.map((step, index) => (
              <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-3 text-sm leading-6">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tomato font-display">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <Ella message="I'll watch the pan and talk you through it. Tap Ask Ella and just say your question." />
      </div>
    </article>
  );
}
