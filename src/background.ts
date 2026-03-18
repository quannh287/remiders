import { getState, setState, trimHistory } from './utils/storage';
import { createCheckInRecord, todayDateString, AUTO_CHECKIN_HOUR_START, AUTO_CHECKIN_HOUR_END } from './utils/types';

export function isWithinWorkHours(): boolean {
  const hour = new Date().getHours();
  return hour >= AUTO_CHECKIN_HOUR_START && hour < AUTO_CHECKIN_HOUR_END;
}

let processing = false;

export async function handleActiveState(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const state = await getState();
    const now = Date.now();
    const today = todayDateString();

    state.lastActiveTimestamp = now;

    if (state.today === null) {
      // First install or no data — create check-in
      state.today = createCheckInRecord(now, state.settings.lunchBreakMinutes);
      createCheckoutAlarm(state.today.expectedCheckoutTime, state.settings.notifyBeforeMinutes);
    } else if (state.today.date !== today) {
      // New day — archive old record, create new check-in
      state.history.push(state.today);
      trimHistory(state);
      state.today = createCheckInRecord(now, state.settings.lunchBreakMinutes);
      createCheckoutAlarm(state.today.expectedCheckoutTime, state.settings.notifyBeforeMinutes);
    }
    // Same day — just update lastActiveTimestamp (already done above)

    await setState(state);
  } finally {
    processing = false;
  }
}

function createCheckoutAlarm(expectedCheckoutTime: number, notifyBeforeMinutes: number): void {
  chrome.alarms.create('checkout-reminder', {
    when: expectedCheckoutTime - notifyBeforeMinutes * 60000,
  });
}

// --- Service Worker Initialization (top-level) ---

chrome.idle.setDetectionInterval(300);

chrome.idle.onStateChanged.addListener(async (newState: 'active' | 'idle' | 'locked') => {
  if (newState === 'active') {
    await handleActiveState();
  }
});

export async function handleCheckoutAlarm(): Promise<void> {
  const permLevel = await chrome.notifications.getPermissionLevel();
  if (permLevel === 'granted') {
    const state = await getState();
    const remainingMs = state.today ? state.today.expectedCheckoutTime - Date.now() : 0;
    const mins = Math.max(0, Math.round(remainingMs / 60000));
    chrome.notifications.create('checkout-notify', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Work Timer',
      message: `Con ${mins} phut nua la du gio lam viec!`,
    });
  }
}

export async function verifyAlarmExists(): Promise<void> {
  const state = await getState();
  if (state.today && state.today.date === todayDateString()) {
    const alarm = await chrome.alarms.get('checkout-reminder');
    if (!alarm) {
      createCheckoutAlarm(state.today.expectedCheckoutTime, state.settings.notifyBeforeMinutes);
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === 'checkout-reminder') {
    await handleCheckoutAlarm();
  }
});

// Check notification permission on install
chrome.runtime.onInstalled.addListener(async () => {
  const permLevel = await chrome.notifications.getPermissionLevel();
  await chrome.storage.local.set({ notificationPermission: permLevel });
});

// On service worker restart, verify alarm exists
verifyAlarmExists();
