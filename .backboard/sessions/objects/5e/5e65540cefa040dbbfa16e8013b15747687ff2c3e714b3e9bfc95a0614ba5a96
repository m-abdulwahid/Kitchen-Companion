const CUISINE_AREA: Record<string, string> = {
  american: "American",
  chinese: "Chinese",
  french: "French",
  greek: "Greek",
  italian: "Italian",
  japanese: "Japanese",
  mexican: "Mexican",
  portuguese: "Portuguese",
  spanish: "Spanish",
  thai: "Thai",
  turkish: "Turkish",
};

const FALLBACK_FOOD_PHOTOS = [
  "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
];

const cuisineCache = new Map<string, string[]>();

function pick(urls: string[], seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return urls[hash % urls.length];
}

type MealThumb = { strMealThumb?: string };

export async function photoForRecipe(
  name: string,
  cuisine?: string,
  id?: string | number,
): Promise<string> {
  const area = CUISINE_AREA[(cuisine ?? "").toLowerCase()] ?? "American";
  let urls = cuisineCache.get(area);
  if (!urls) {
    try {
      const response = await fetch(
        `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`,
        { next: { revalidate: 3600 } },
      );
      if (response.ok) {
        const data = (await response.json()) as { meals?: MealThumb[] | null };
        urls = (data.meals ?? [])
          .map((meal) => meal.strMealThumb)
          .filter((url): url is string => Boolean(url));
      }
    } catch {
      urls = [];
    }
    if (!urls?.length) urls = FALLBACK_FOOD_PHOTOS;
    cuisineCache.set(area, urls);
  }
  return pick(urls, `${name}-${id ?? ""}`);
}
