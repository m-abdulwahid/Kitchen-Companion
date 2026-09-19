import { createChoiceStore } from "./choice-store";
import { DEFAULT_LANGUAGE } from "./languages";

const store = createChoiceStore("kitchen-companion-language-v1", DEFAULT_LANGUAGE.code);

export const getLanguageCodeSnapshot = store.getSnapshot;
export const subscribeLanguage = store.subscribe;
export const setLanguageCode = store.set;
