import { parseIngredient } from "@/lib/ingredients";

type IngredientListProps = {
  ingredients: string[];
  tone?: "light" | "dark";
};

export function IngredientList({
  ingredients,
  tone = "light",
}: IngredientListProps) {
  const row =
    tone === "dark"
      ? "grid grid-cols-[7rem_1fr] gap-x-3 rounded-2xl bg-white/10 px-3 py-2 text-sm text-cream"
      : "grid grid-cols-[7rem_1fr] gap-x-3 rounded-2xl bg-cream px-3 py-2 text-sm text-cocoa";

  return (
    <ul className="mt-3 grid gap-2">
      {ingredients.map((item) => {
        const { amount, name } = parseIngredient(item);
        return (
          <li key={item} className={row}>
            <span className="font-semibold tabular-nums">{amount || "—"}</span>
            <span>{name}</span>
          </li>
        );
      })}
    </ul>
  );
}
