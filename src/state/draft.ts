import {saveDraft as persistDraft, clearDraft as persistClear} from '../session.js';

let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 800;

export function saveDraft(draft: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!draft) {
    persistClear();
    return;
  }
  debounceTimer = setTimeout(() => {
    persistDraft(draft);
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

export function clearDraft(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  persistClear();
}

export function flushDraft(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

