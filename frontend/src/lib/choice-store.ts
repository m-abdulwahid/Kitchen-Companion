/**
 * A tiny "remember this choice in the browser" store, shaped for useSyncExternalStore so every
 * component sees a change right away. Used for the chosen companion and language.
 */
export function createChoiceStore(storageKey: string, fallback: string) {
  const listeners = new Set<() => void>();
  let memory: string | null = null; // used if browser storage is blocked

  return {
    getSnapshot(): string {
      try {
        return window.localStorage.getItem(storageKey) ?? memory ?? fallback;
      } catch {
        return memory ?? fallback;
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      window.addEventListener("storage", listener); // changes from other tabs
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    set(value: string) {
      memory = value;
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // storage blocked: the choice lasts until the page is closed
      }
      listeners.forEach((listener) => listener());
    },
  };
}
