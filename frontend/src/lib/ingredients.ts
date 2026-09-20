export type IngredientParts = { amount: string; name: string };

export function parseIngredient(line: string): IngredientParts {
  const pipe = line.split("|");
  if (pipe.length >= 2) {
    return { amount: pipe[0].trim(), name: pipe.slice(1).join("|").trim() };
  }
  const match = line.match(
    /^([\d¼½¾⅓⅔⅛⅜/.]+(?:\s*-\s*[\d¼½¾⅓⅔/.]+)?\s*(?:cups?|tbsp|tsp|oz|g|ml|lb|cloves?|slices?|cans?|bunch(?:es)?|pinch(?:es)?|handfuls?|pkg|package)?)\s+(.+)$/i,
  );
  if (match) return { amount: match[1].trim(), name: match[2].trim() };
  return { amount: "", name: line.trim() };
}

export function costLow(cost: string): number {
  const match = cost.match(/(\d+)/);
  return match ? Number(match[1]) : 99;
}
