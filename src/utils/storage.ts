import { AppState, Settings, createDefaultAppState } from './types';

const STORAGE_KEY = 'appState';

export async function getState(): Promise<AppState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as AppState) ?? createDefaultAppState();
}

export async function setState(state: AppState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function updateSettings(partial: Partial<Settings>): Promise<AppState> {
  const state = await getState();
  state.settings = { ...state.settings, ...partial };
  await setState(state);
  return state;
}

export const MAX_HISTORY_LENGTH = 90;

export function trimHistory(state: AppState): void {
  if (state.history.length > MAX_HISTORY_LENGTH) {
    state.history = state.history.slice(-MAX_HISTORY_LENGTH);
  }
}
