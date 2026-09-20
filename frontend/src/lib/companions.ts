/**
 * Whisk-Ella is the chef. These two Omni voices are how she can sound.
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

export const COMPANIONS: Companion[] = [
  {
    id: "ella",
    name: "Ella",
    label: "Ella",
    voice: "Tina",
    blurb: "Warm, whisk-quick, a little punny.",
    style:
      "You are Whisk-Ella, also called Ella: a sweet cat chef. Warm, playful, lightly punny, and precise about heat and amounts. Two short spoken sentences.",
  },
  {
    id: "whisk",
    name: "Ella",
    label: "Whisk",
    voice: "Aiden",
    blurb: "Same Ella, a little lower.",
    style:
      "You are Whisk-Ella, also called Ella: a sweet cat chef with a calmer, lower voice. Warm, playful, lightly punny. Two short spoken sentences.",
  },
];

export const DEFAULT_COMPANION = COMPANIONS[0];

export function getCompanion(id: string | null | undefined): Companion {
  return COMPANIONS.find((companion) => companion.id === id) ?? DEFAULT_COMPANION;
}
