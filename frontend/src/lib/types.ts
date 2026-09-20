export type DietTag = "halal" | "vegetarian" | "vegan" | "gluten-free";

export type Meal = "breakfast" | "snack" | "lunch" | "dinner" | "dessert";

export type RecipeSource = "kitchen" | "tiktok" | "instagram" | "youtube" | "web" | "api";

export type Recipe = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  imageUrl?: string;
  timeMinutes: number;
  cost: string;
  servings: number;
  diets: DietTag[];
  meal: Meal;
  ingredients: string[];
  steps: string[];
  source: RecipeSource;
  videoUrl?: string;
};

export type VisionCheckResult = {
  passed: boolean;
  feedback: string;
};
