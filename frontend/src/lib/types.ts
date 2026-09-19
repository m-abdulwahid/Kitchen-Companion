export type DietTag = "halal" | "vegetarian" | "vegan" | "gluten-free";

export type RecipeSource = "kitchen" | "tiktok" | "instagram";

export type Recipe = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  timeMinutes: number;
  cost: string;
  servings: number;
  diets: DietTag[];
  ingredients: string[];
  steps: string[];
  source: RecipeSource;
};

export type VisionCheckResult = {
  passed: boolean;
  feedback: string;
};
