import { createChoiceStore } from "./choice-store";
import { DEFAULT_COMPANION } from "./companions";

const store = createChoiceStore("kitchen-companion-chef-v1", DEFAULT_COMPANION.id);

export const getCompanionIdSnapshot = store.getSnapshot;
export const subscribeCompanion = store.subscribe;
export const setCompanionId = store.set;
