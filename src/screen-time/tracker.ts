import { DailyAggregate, HourlySlotMap, ScreenSession, ScreenTimeState } from './types';
import { getScreenTimeState, setScreenTimeState } from './storage';
import { getState as getAppState } from '../utils/storage';

function formatSlotKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}-${h}`;
}

export function aggregateToHourlySlots(session: ScreenSession, slots: HourlySlotMap): void {
  if (session.end === null) return;

  let cursor = session.start;
  const end = session.end;

  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const hourEnd = new Date(cursorDate);
    hourEnd.setMinutes(0, 0, 0);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const sliceEnd = Math.min(hourEnd.getTime(), end);
    const minutes = Math.floor((sliceEnd - cursor) / 60000);

    if (minutes > 0) {
      const key = formatSlotKey(cursorDate);
      slots[key] = Math.min(60, (slots[key] || 0) + minutes);
    }

    cursor = sliceEnd;
  }
}

export function upsertDailyAggregate(state: ScreenTimeState, dateStr: string): void {
  // Recompute totalMinutes from hourly slots for this date
  let totalMinutes = 0;
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    if (key.substring(0, 10) === dateStr) {
      totalMinutes += val;
    }
  }

  const existing = state.dailyAggregates.find((a) => a.date === dateStr);
  if (existing) {
    existing.sessionCount += 1;
    existing.breakCount = Math.max(0, existing.sessionCount - 1);
    existing.totalMinutes = totalMinutes;
  } else {
    state.dailyAggregates.push({
      date: dateStr,
      totalMinutes,
      sessionCount: 1,
      breakCount: 0,
    });
  }
}

function dateStrFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SLOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function trimOldData(state: ScreenTimeState): void {
  const now = Date.now();
  const sessionCutoff = now - SESSION_RETENTION_MS;
  state.sessions = state.sessions.filter((s) => s.start >= sessionCutoff);

  const slotCutoff = now - SLOT_RETENTION_MS;
  for (const key of Object.keys(state.hourlySlots)) {
    const datePart = key.substring(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    const slotDate = new Date(y, m - 1, d).getTime();
    if (slotDate < slotCutoff) {
      delete state.hourlySlots[key];
    }
  }

  const cutoffDate = new Date(now - SLOT_RETENTION_MS);
  const slotCutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
  state.dailyAggregates = state.dailyAggregates.filter((a) => a.date >= slotCutoffStr);
}

export async function getScreenTimeIdleThreshold(): Promise<number> {
  const state = await getScreenTimeState();
  return state.settings.idleThresholdMinutes;
}

let screenTimeProcessing = false;

export async function handleScreenTimeStateChange(newState: 'active' | 'idle' | 'locked'): Promise<void> {
  if (screenTimeProcessing) return;
  screenTimeProcessing = true;
  try {
    const appState = await getAppState();
    if (!appState.today) return;

    const state = await getScreenTimeState();
    const now = Date.now();

    if (newState === 'active') {
      // Close existing open session before creating a new one (e.g., duplicate active events)
      if (state.currentSession && state.currentSession.end === null) {
        state.currentSession.end = now;
        aggregateToHourlySlots(state.currentSession, state.hourlySlots);
        state.sessions.push({ ...state.currentSession });
        if (state.currentSession.type === 'active') {
          upsertDailyAggregate(state, dateStrFromTimestamp(state.currentSession.start));
        }
      }
      state.currentSession = { start: now, end: null, type: 'active' };
    } else {
      if (state.currentSession && state.currentSession.end === null) {
        state.currentSession.end = now;
        aggregateToHourlySlots(state.currentSession, state.hourlySlots);
        state.sessions.push({ ...state.currentSession });
        if (state.currentSession.type === 'active') {
          upsertDailyAggregate(state, dateStrFromTimestamp(state.currentSession.start));
        }
        state.currentSession = null;
        trimOldData(state);
      }
    }

    await setScreenTimeState(state);
  } finally {
    screenTimeProcessing = false;
  }
}

export async function initScreenTimeTracker(): Promise<void> {
  await recoverSession();
  const screenTimeSeconds = (await getScreenTimeIdleThreshold()) * 60;
  const WORK_TIMER_IDLE_SECONDS = 300;
  chrome.idle.setDetectionInterval(Math.min(WORK_TIMER_IDLE_SECONDS, screenTimeSeconds));
  chrome.alarms.create('screenTimeTrim', { periodInMinutes: 1440 });

  // Create initial active session if user is currently active
  // chrome.idle.onStateChanged only fires on CHANGES, so on startup
  // we need to explicitly check and start a session
  const currentState = await chrome.idle.queryState(Math.min(WORK_TIMER_IDLE_SECONDS, screenTimeSeconds));
  if (currentState === 'active') {
    await handleScreenTimeStateChange('active');
  }
}

export async function recoverSession(): Promise<void> {
  const state = await getScreenTimeState();
  if (!state.currentSession) return;

  const appState = await getAppState();
  const lastActive = appState.lastActiveTimestamp;
  const sessionStartDate = new Date(state.currentSession.start).toDateString();
  const lastActiveDate = new Date(lastActive).toDateString();
  const todayDate = appState.today ? new Date(appState.today.date).toDateString() : null;

  if (
    lastActive > 0 &&
    sessionStartDate === lastActiveDate &&
    todayDate !== null &&
    sessionStartDate === todayDate
  ) {
    state.currentSession.end = lastActive;
    aggregateToHourlySlots(state.currentSession, state.hourlySlots);
    state.sessions.push({ ...state.currentSession });
  }

  state.currentSession = null;
  await setScreenTimeState(state);
}
