"use client";

import { useEffect, useMemo, useState } from "react";
import { RecipeGrid } from "@/components/RecipeGrid";
import type { DietTag, Recipe } from "@/lib/types";

const DIETS: { id: DietTag; label: string }[] = [
  { id: "halal", label: "Halal" },
  { id: "vegetarian", label: "Veggie" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten free" },
];

type RecipeBrowserProps = {
  recipes: Recipe[];
  savedIds: string[];
  onOpen: (recipe: Recipe) => void;
  heading: string;
  subheading: string;
  emptyMessage: string;
  live?: boolean;
};

export function RecipeBrowser({
  recipes,
  savedIds,
  onOpen,
  heading,
  subheading,
  emptyMessage,
  live = false,
}: RecipeBrowserProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [diets, setDiets] = useState<DietTag[]>([]);
  const [remote, setRemote] = useState<Recipe[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (debounced.includes(",")) params.set("ingredients", debounced);
    else if (debounced) params.set("search", debounced);
    if (diets[0]) params.set("dietary_tags", diets[0]);
    setLoading(true);
    fetch(`/api/recipes?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { recipes?: Recipe[] }) => {
        if (!cancelled) setRemote(data.recipes ?? []);
      })
      .catch(() => {
        if (!cancelled) setRemote(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, diets, live]);

  const filteredLocal = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const matchesDiet =
        diets.length === 0 || diets.every((diet) => recipe.diets.includes(diet));
      const haystack = [recipe.title, recipe.description, ...recipe.ingredients]
        .join(" ")
        .toLowerCase();
      return (needle.length === 0 || haystack.includes(needle)) && matchesDiet;
    });
  }, [diets, query, recipes]);

  const shown = (live ? remote ?? recipes : filteredLocal).filter((recipe) =>
    diets.length <= 1 ? true : diets.every((diet) => recipe.diets.includes(diet)),
  );

  function toggleDiet(diet: DietTag) {
    setDiets((current) =>
      current.includes(diet)
        ? current.filter((item) => item !== diet)
        : [...current, diet],
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl text-espresso sm:text-5xl">{heading}</h1>
        <p className="mt-2 max-w-2xl text-cocoa/80">{subheading}</p>
      </div>
      <div className="mb-6 rounded-[2rem] bg-white/80 p-4 shadow-[0_8px_24px_rgba(107,63,42,0.06)]">
        <label className="block text-sm font-semibold text-cocoa">
          Search recipes or ingredients
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="pasta, tomato, chickpeas…"
            className="mt-2 w-full rounded-2xl border border-peach bg-cream px-4 py-3 text-base text-espresso outline-none ring-tomato/30 placeholder:text-caramel/70 focus:ring-4"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIETS.map((diet) => {
            const on = diets.includes(diet.id);
            return (
              <button
                key={diet.id}
                type="button"
                onClick={() => toggleDiet(diet.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  on
                    ? "bg-tomato text-cream"
                    : "bg-peach/70 text-cocoa hover:bg-peach"
                }`}
              >
                {diet.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <p className="mb-3 text-sm font-semibold text-caramel">Finding dishes…</p>
      ) : null}
      <RecipeGrid
        recipes={shown}
        savedIds={savedIds}
        onOpen={onOpen}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
