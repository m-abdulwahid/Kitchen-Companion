/**
 * Whisk-Ella is the assistant. These Omni voices are how she can sound.
 * `voice` must be a name from voice/voices.json.
 */
export type Companion = {
  id: string;
  name: string;
  label: string;
  voice: string;
  blurb: string;
  style: string;
};

const STYLE =
  "You are Whisk-Ella, also called Ella: a sweet cat chef. Warm, playful, lightly punny, and precise about heat and amounts. Two short spoken sentences.";

export const COMPANIONS: Companion[] = [
  { id: "tina", name: "Ella", label: "Tina", voice: "Tina", blurb: "Warm cocoa, default Ella.", style: STYLE },
  { id: "aiden", name: "Ella", label: "Aiden", voice: "Aiden", blurb: "Young cook energy.", style: STYLE },
  { id: "serena", name: "Ella", label: "Serena", voice: "Serena", blurb: "Gentle and clear.", style: STYLE },
  { id: "jennifer", name: "Ella", label: "Jennifer", voice: "Jennifer", blurb: "Cooking-show host.", style: STYLE },
  { id: "mione", name: "Ella", label: "Mione", voice: "Mione", blurb: "Calm British sous-chef.", style: STYLE },
  { id: "ryan", name: "Ella", label: "Ryan", voice: "Ryan", blurb: "High-energy hype.", style: STYLE },
  { id: "ethan", name: "Ella", label: "Ethan", voice: "Ethan", blurb: "Bright and youthful.", style: STYLE },
  { id: "harvey", name: "Ella", label: "Harvey", voice: "Harvey", blurb: "Deep coffee-shop calm.", style: STYLE },
  { id: "maia", name: "Ella", label: "Maia", voice: "Maia", blurb: "Smart and gentle.", style: STYLE },
  { id: "evan", name: "Ella", label: "Evan", voice: "Evan", blurb: "Campus-kid warmth.", style: STYLE },
];

export const DEFAULT_COMPANION = COMPANIONS[0];

export function getCompanion(id: string | null | undefined): Companion {
  return COMPANIONS.find((companion) => companion.id === id) ?? DEFAULT_COMPANION;
}
