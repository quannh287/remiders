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

export function applyManualCheckIn(state: AppState, checkInTime: number): AppState {
  const d = new Date(checkInTime);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (!state.today) {
    state.today = {
      date: dateStr,
      checkInTime,
      expectedCheckoutTime: calculateCheckoutTime(checkInTime, state.settings.lunchBreakMinutes),
      manualOverride: true,
    };
  } else {
    state.today.checkInTime = checkInTime;
    state.today.expectedCheckoutTime = calculateCheckoutTime(checkInTime, state.settings.lunchBreakMinutes);
    state.today.manualOverride = true;
  }

  return state;
}

export function checkInNow(state: AppState): AppState {
  if (state.today) return state;
  const now = Date.now();
  const d = new Date(now);
  state.today = {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    checkInTime: now,
    expectedCheckoutTime: calculateCheckoutTime(now, state.settings.lunchBreakMinutes),
    manualOverride: false,
  };
  return state;
}

export function isNotificationGranted(level: string): boolean {
  return level === 'granted';
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
  // Start clock immediately — doesn't depend on state
  updateClock();
  startClockInterval();

  const state = await getState();
  render(state);
  startCountdown();
  bindEvents();
  checkNotificationPermission();
}

function updateClock(): void {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();

  const hourDeg = hours * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6;

  const hourHand = document.getElementById('clock-hour');
  const minuteHand = document.getElementById('clock-minute');
  if (hourHand) hourHand.setAttribute('transform', `rotate(${hourDeg} 100 100)`);
  if (minuteHand) minuteHand.setAttribute('transform', `rotate(${minuteDeg} 100 100)`);

  // Update progress arc and remaining text
  updateClockProgress();
}

function updateClockProgress(): void {
  const arc = document.getElementById('clock-progress-arc');
  const arcOvertime = document.getElementById('clock-progress-arc-overtime');
  const remainingEl = document.getElementById('remaining-time');
  if (!arc || !remainingEl || !arcOvertime) return;

  const circumference = 2 * Math.PI * 90; // r=90

  if (cachedCheckIn !== null && cachedCheckout !== null) {
    const progress = calculateProgress(cachedCheckIn, cachedCheckout, Date.now());
    const remaining = cachedCheckout - Date.now();
    const offset = circumference - (circumference * Math.min(progress, 100)) / 100;

    if (progress >= 100) {
      arc.classList.add('hidden');
      arcOvertime.classList.remove('hidden');
      arcOvertime.setAttribute('stroke-dashoffset', '0');
      remainingEl.setAttribute('fill', '#EF4444');
    } else {
      arc.classList.remove('hidden');
      arcOvertime.classList.add('hidden');
      arc.setAttribute('stroke-dashoffset', String(offset));
      remainingEl.setAttribute('fill', '#2563EB');
    }

    remainingEl.textContent = formatRemaining(remaining);
  } else {
    arc.setAttribute('stroke-dashoffset', String(circumference));
    arcOvertime.classList.add('hidden');
    remainingEl.textContent = '--:--';
    remainingEl.setAttribute('fill', '#94A3B8');
  }
}

let clockInterval: ReturnType<typeof setInterval> | null = null;

function startClockInterval(): void {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(updateClock, 60000);
}

function render(state: AppState): void {
  const dateEl = document.getElementById('current-date')!;
  const checkinEl = document.getElementById('checkin-time')!;
  const lunchEl = document.getElementById('lunch-break')!;
  const checkoutEl = document.getElementById('checkout-time')!;
  const progressStartEl = document.getElementById('progress-start')!;
  const progressEndEl = document.getElementById('progress-end')!;
  const progressPctEl = document.getElementById('progress-pct')!;
  const statusBadge = document.getElementById('status-badge')!;
  const statusText = document.getElementById('status-text')!;

  const emptyState = document.getElementById('empty-state')!;
  const mainContent = document.getElementById('main-content')!;

  const today = new Date();
  dateEl.textContent = today.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  if (state.today) {
    emptyState.classList.add('hidden');
    mainContent.classList.remove('hidden');
    checkinEl.textContent = formatTime(state.today.checkInTime);
    lunchEl.textContent = `${state.settings.lunchBreakMinutes}m`;
    checkoutEl.textContent = formatTime(state.today.expectedCheckoutTime);
    progressStartEl.textContent = formatTime(state.today.checkInTime);
    progressEndEl.textContent = formatTime(state.today.expectedCheckoutTime);

    const remaining = state.today.expectedCheckoutTime - Date.now();
    const progress = calculateProgress(state.today.checkInTime, state.today.expectedCheckoutTime, Date.now());
    progressPctEl.textContent = `${progress}%`;

    // Update status badge
    statusBadge.classList.remove('status-badge--inactive');
    statusBadge.classList.add('status-badge--active');
    statusText.textContent = remaining <= 0 ? 'Done' : 'Working';

    updateCountdownCache(state.today.checkInTime, state.today.expectedCheckoutTime);
  } else {
    emptyState.classList.remove('hidden');
    mainContent.classList.add('hidden');
    checkinEl.textContent = '--:--';
    lunchEl.textContent = `${state.settings.lunchBreakMinutes}m`;
    checkoutEl.textContent = '--:--';
    progressPctEl.textContent = '0%';
    progressStartEl.textContent = '--:--';
    progressEndEl.textContent = '--:--';

    statusBadge.classList.remove('status-badge--active');
    statusBadge.classList.add('status-badge--inactive');
    statusText.textContent = 'Idle';

    updateCountdownCache(null, null);
  }

  // Update clock display immediately
  updateClockProgress();
}

let countdownInterval: ReturnType<typeof setInterval> | null = null;
let cachedCheckIn: number | null = null;
let cachedCheckout: number | null = null;

function startCountdown(): void {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (cachedCheckIn !== null && cachedCheckout !== null) {
      const remaining = cachedCheckout - Date.now();
      const progress = calculateProgress(cachedCheckIn, cachedCheckout, Date.now());

      document.getElementById('progress-pct')!.textContent = `${progress}%`;
      document.getElementById('status-text')!.textContent = remaining <= 0 ? 'Done' : 'Working';

      // Update clock arc and remaining text
      updateClockProgress();
    }
  }, 1000);
}

function updateCountdownCache(checkIn: number | null, checkout: number | null): void {
  cachedCheckIn = checkIn;
  cachedCheckout = checkout;
}

function bindEvents(): void {
  // Check in now
  document.getElementById('btn-checkin-now')!.addEventListener('click', async () => {
    const state = await getState();
    checkInNow(state);
    await setState(state);

    chrome.alarms.create('checkout-reminder', {
      when: state.today!.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
    });

    render(state);
  });

  // Toggle manual check-in input
  document.getElementById('btn-checkin-manual-toggle')!.addEventListener('click', () => {
    document.getElementById('manual-checkin-row')!.classList.remove('hidden');
  });

  document.getElementById('btn-manual-checkin-cancel')!.addEventListener('click', () => {
    document.getElementById('manual-checkin-row')!.classList.add('hidden');
  });

  // Save manual check-in from empty state
  document.getElementById('btn-manual-checkin-save')!.addEventListener('click', async () => {
    const input = document.getElementById('manual-checkin-input') as HTMLInputElement;
    const [hours, minutes] = input.value.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;

    const state = await getState();
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    applyManualCheckIn(state, now.getTime());
    await setState(state);

    chrome.alarms.create('checkout-reminder', {
      when: state.today!.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
    });

    render(state);
  });

  // Edit check-in — click the card
  document.getElementById('card-checkin')!.addEventListener('click', () => {
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

    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    applyManualCheckIn(state, now.getTime());
    await setState(state);

    // Recreate alarm
    await chrome.alarms.clear('checkout-reminder');
    chrome.alarms.create('checkout-reminder', {
      when: state.today!.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
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
    if (isNaN(lunch) || isNaN(notify) || lunch < 0 || lunch > 180 || notify < 1 || notify > 60) return;

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

  // Test notification
  document.getElementById('btn-test-notify')!.addEventListener('click', () => {
    chrome.notifications.create('test-notify', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Work Timer',
      message: 'Notification hoạt động bình thường!',
    });
  });
}

async function checkNotificationPermission(): Promise<void> {
  const warning = document.getElementById('notification-warning')!;
  const testBtn = document.getElementById('btn-test-notify')!;
  let granted = false;

  try {
    const level = await chrome.notifications.getPermissionLevel();
    granted = isNotificationGranted(level);
  } catch {
    granted = false;
  }

  if (granted) {
    warning.classList.add('hidden');
    testBtn.classList.remove('hidden');
  } else {
    warning.classList.remove('hidden');
    testBtn.classList.add('hidden');
  }
}
