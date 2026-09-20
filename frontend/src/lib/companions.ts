/**
 * Whisk-Ella is the assistant. Serena is her voice.
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
  "You are Ella, a cooking coach. You are patient and practical, you listen to the user and are never weird. No cat talk or jokes.";

export const COMPANIONS: Companion[] = [
  {
    id: "serena",
    name: "Ella",
    label: "Serena",
    voice: "Serena",
    blurb: "Gentle and clear.",
    style: STYLE,
  },
];

export const DEFAULT_COMPANION = COMPANIONS[0];

export function getCompanion(id: string | null | undefined): Companion {
  return COMPANIONS.find((companion) => companion.id === id) ?? DEFAULT_COMPANION;
}
