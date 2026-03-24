import { ScreenTimeState, ScreenTimeSettings, createDefaultScreenTimeState } from './types';

const STORAGE_KEY = 'screenTimeState';

export async function getScreenTimeState(): Promise<ScreenTimeState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as ScreenTimeState) ?? createDefaultScreenTimeState();
}

export async function setScreenTimeState(state: ScreenTimeState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function updateScreenTimeSettings(partial: Partial<ScreenTimeSettings>): Promise<ScreenTimeState> {
  const state = await getScreenTimeState();
  state.settings = { ...state.settings, ...partial };
  await setScreenTimeState(state);
  return state;
}
