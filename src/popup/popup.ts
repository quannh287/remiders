import { getState, setState, updateSettings } from '../utils/storage';
import { calculateCheckoutTime, AppState, CheckInRecord } from '../utils/types';

// --- Helper functions (exported for testing) ---

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0h 0m';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

export function calculateProgress(checkIn: number, checkout: number, now: number): number {
  const total = checkout - checkIn;
  const elapsed = now - checkIn;
  const pct = Math.round((elapsed / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

// --- DOM interaction (only runs in browser) ---

function isInBrowser(): boolean {
  return typeof document !== 'undefined';
}

if (isInBrowser()) {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
}

async function init(): Promise<void> {
  const state = await getState();
  render(state);
  startCountdown();
  bindEvents();
  checkNotificationPermission();
}

function render(state: AppState): void {
  const dateEl = document.getElementById('current-date')!;
  const checkinEl = document.getElementById('checkin-time')!;
  const lunchEl = document.getElementById('lunch-break')!;
  const checkoutEl = document.getElementById('checkout-time')!;
  const remainingEl = document.getElementById('remaining-time')!;
  const progressEl = document.getElementById('progress-fill')!;

  const today = new Date();
  dateEl.textContent = today.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (state.today) {
    checkinEl.textContent = formatTime(state.today.checkInTime);
    lunchEl.textContent = `${state.settings.lunchBreakMinutes} phut`;
    checkoutEl.textContent = formatTime(state.today.expectedCheckoutTime);

    const remaining = state.today.expectedCheckoutTime - Date.now();
    remainingEl.textContent = formatRemaining(remaining);

    const progress = calculateProgress(state.today.checkInTime, state.today.expectedCheckoutTime, Date.now());
    progressEl.style.width = `${progress}%`;
  } else {
    checkinEl.textContent = '--:--';
    lunchEl.textContent = `${state.settings.lunchBreakMinutes} phut`;
    checkoutEl.textContent = '--:--';
    remainingEl.textContent = '--';
    progressEl.style.width = '0%';
  }
}

let countdownInterval: ReturnType<typeof setInterval> | null = null;

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(async () => {
    const state = await getState();
    if (state.today) {
      const remaining = state.today.expectedCheckoutTime - Date.now();
      document.getElementById('remaining-time')!.textContent = formatRemaining(remaining);
      const progress = calculateProgress(state.today.checkInTime, state.today.expectedCheckoutTime, Date.now());
      document.getElementById('progress-fill')!.style.width = `${progress}%`;
    }
  }, 1000);
}

function bindEvents(): void {
  // Edit check-in
  document.getElementById('btn-edit-checkin')!.addEventListener('click', () => {
    document.getElementById('edit-checkin-row')!.classList.remove('hidden');
  });

  document.getElementById('btn-cancel-checkin')!.addEventListener('click', () => {
    document.getElementById('edit-checkin-row')!.classList.add('hidden');
  });

  document.getElementById('btn-save-checkin')!.addEventListener('click', async () => {
    const input = document.getElementById('checkin-input') as HTMLInputElement;
    const [hours, minutes] = input.value.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;

    const state = await getState();
    if (!state.today) return;

    const newCheckIn = new Date(state.today.checkInTime);
    newCheckIn.setHours(hours, minutes, 0, 0);

    state.today.checkInTime = newCheckIn.getTime();
    state.today.expectedCheckoutTime = calculateCheckoutTime(newCheckIn.getTime(), state.settings.lunchBreakMinutes);
    state.today.manualOverride = true;
    await setState(state);

    // Recreate alarm
    await chrome.alarms.clear('checkout-reminder');
    chrome.alarms.create('checkout-reminder', {
      when: state.today.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
    });

    document.getElementById('edit-checkin-row')!.classList.add('hidden');
    render(state);
  });

  // Settings toggle
  document.getElementById('btn-settings')!.addEventListener('click', () => {
    const panel = document.getElementById('settings-panel')!;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      getState().then((state) => {
        (document.getElementById('setting-lunch') as HTMLInputElement).value = String(state.settings.lunchBreakMinutes);
        (document.getElementById('setting-notify') as HTMLInputElement).value = String(state.settings.notifyBeforeMinutes);
      });
    }
  });

  // Save settings
  document.getElementById('btn-save-settings')!.addEventListener('click', async () => {
    const lunch = parseInt((document.getElementById('setting-lunch') as HTMLInputElement).value);
    const notify = parseInt((document.getElementById('setting-notify') as HTMLInputElement).value);
    if (isNaN(lunch) || isNaN(notify)) return;

    const state = await updateSettings({ lunchBreakMinutes: lunch, notifyBeforeMinutes: notify });

    // Recalculate checkout if today exists
    if (state.today) {
      state.today.expectedCheckoutTime = calculateCheckoutTime(state.today.checkInTime, lunch);
      await setState(state);

      await chrome.alarms.clear('checkout-reminder');
      chrome.alarms.create('checkout-reminder', {
        when: state.today.expectedCheckoutTime - notify * 60000,
      });
    }

    document.getElementById('settings-panel')!.classList.add('hidden');
    render(state);
  });

  // Export
  document.getElementById('btn-export')!.addEventListener('click', async () => {
    const state = await getState();
    const allRecords = [...state.history];
    if (state.today) allRecords.push(state.today);

    const format = (document.getElementById('export-format') as HTMLSelectElement).value;
    const dateStr = new Date().toISOString().split('T')[0];
    let blob: Blob;
    let filename: string;

    if (format === 'json') {
      blob = new Blob([JSON.stringify(allRecords, null, 2)], { type: 'application/json' });
      filename = `work-timer-history-${dateStr}.json`;
    } else {
      const header = 'date,checkInTime,expectedCheckoutTime,manualOverride';
      const rows = allRecords.map((r) =>
        `${r.date},${formatTime(r.checkInTime)},${formatTime(r.expectedCheckoutTime)},${r.manualOverride}`
      );
      blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
      filename = `work-timer-history-${dateStr}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

async function checkNotificationPermission(): Promise<void> {
  const level = await chrome.notifications.getPermissionLevel();
  const warning = document.getElementById('notification-warning')!;
  if (level !== 'granted') {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}
