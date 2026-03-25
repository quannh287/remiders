import { ScreenTimeState, ScreenTimeSettings, createDefaultScreenTimeState, DailyAggregate } from './types';

const STORAGE_KEY = 'screenTimeState';

export function migrateScreenTimeState(state: ScreenTimeState): ScreenTimeState {
  if (state.schemaVersion >= 2) return state;

  // Backfill totalMinutes from hourly slots
  const dayMinutes: Record<string, number> = {};
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    const datePart = key.substring(0, 10);
    dayMinutes[datePart] = (dayMinutes[datePart] || 0) + val;
  }

  // Count active sessions per day from sessions array
  const daySessions: Record<string, number> = {};
  for (const s of state.sessions) {
    if (s.type !== 'active') continue;
    const d = new Date(s.start);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    daySessions[dateStr] = (daySessions[dateStr] || 0) + 1;
  }

  // Build aggregates for all dates with slot data
  const allDates = new Set([...Object.keys(dayMinutes), ...Object.keys(daySessions)]);
  const aggregates: DailyAggregate[] = [];
  for (const date of allDates) {
    const sessionCount = daySessions[date] || 0;
    aggregates.push({
      date,
      totalMinutes: dayMinutes[date] || 0,
      sessionCount,
      breakCount: Math.max(0, sessionCount - 1),
    });
  }

  state.dailyAggregates = aggregates;
  state.schemaVersion = 2;
  return state;
}

export async function getScreenTimeState(): Promise<ScreenTimeState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const raw = (result[STORAGE_KEY] as ScreenTimeState) ?? createDefaultScreenTimeState();
  return migrateScreenTimeState(raw);
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
