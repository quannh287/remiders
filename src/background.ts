import { getState, setState, trimHistory } from './utils/storage';
import { createCheckInRecord, todayDateString, AUTO_CHECKIN_HOUR_START, AUTO_CHECKIN_HOUR_END } from './utils/types';
import { handleScreenTimeStateChange, initScreenTimeTracker } from './screen-time/tracker';

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

    if (state.today === null && isWithinWorkHours()) {
      state.today = createCheckInRecord(now, state.settings.lunchBreakMinutes);
      createCheckoutAlarm(state.today.expectedCheckoutTime, state.settings.notifyBeforeMinutes);
    } else if (state.today && state.today.date !== today && isWithinWorkHours()) {
      state.history.push(state.today);
      trimHistory(state);
      state.today = createCheckInRecord(now, state.settings.lunchBreakMinutes);
      createCheckoutAlarm(state.today.expectedCheckoutTime, state.settings.notifyBeforeMinutes);
    }

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

// Unified idle state dispatcher
chrome.idle.onStateChanged.addListener(async (state: 'active' | 'idle' | 'locked') => {
  if (state === 'active') {
    await handleActiveState();
  }
  await handleScreenTimeStateChange(state);
});

chrome.runtime.onStartup.addListener(async () => {
  await handleActiveState();
});

// Initialize screen time tracker and idle detection
initScreenTimeTracker();

// Listen for settings changes from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'updateIdleInterval') {
    initScreenTimeTracker();
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
  } else if (alarm.name === 'screenTimeTrim') {
    const { getScreenTimeState, setScreenTimeState } = await import('./screen-time/storage');
    const { trimOldData } = await import('./screen-time/tracker');
    const state = await getScreenTimeState();
    trimOldData(state);
    await setScreenTimeState(state);
  }
});

// Check notification permission on install
chrome.runtime.onInstalled.addListener(async () => {
  const permLevel = await chrome.notifications.getPermissionLevel();
  await chrome.storage.local.set({ notificationPermission: permLevel });
});

// On service worker restart, verify alarm exists
verifyAlarmExists();
