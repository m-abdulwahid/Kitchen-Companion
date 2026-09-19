/**
 * Fallback identity for the Ratatouille-like sous-chef. The name shown in the app is the
 * companion the user picked (see companions.ts); this is only used where none is passed in.
 */
export const ASSISTANT = {
  name: "Pip",
  tagline: "tiny sous-chef with big opinions",
} as const;
