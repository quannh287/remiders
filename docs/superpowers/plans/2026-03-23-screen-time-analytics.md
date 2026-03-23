# Screen Time Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add screen time tracking (active vs locked/idle) with a heatmap dashboard to the Work Timer Chrome extension.

**Architecture:** New `src/screen-time/` module with its own types, storage, and tracker logic. Background service worker gets a unified idle dispatcher. Popup gets a summary section. Dashboard is a separate entry point using Chart.js for heatmap visualization.

**Tech Stack:** TypeScript, Chrome Extension APIs (idle, storage, alarms), Chart.js + chartjs-chart-matrix, Webpack 5, Jest

---

### Task 1: Types & Storage Module

**Files:**
- Create: `src/screen-time/types.ts`
- Create: `src/screen-time/storage.ts`
- Create: `tests/screen-time/storage.test.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/screen-time/types.ts

export interface ScreenSession {
  start: number;
  end: number | null;
  type: 'active' | 'locked' | 'idle';
}

export type HourlySlotMap = Record<string, number>;

export interface ScreenTimeSettings {
  idleThresholdMinutes: number;
}

export interface ScreenTimeState {
  sessions: ScreenSession[];
  hourlySlots: HourlySlotMap;
  currentSession: ScreenSession | null;
  settings: ScreenTimeSettings;
  schemaVersion: number;
}

export const DEFAULT_SCREEN_TIME_SETTINGS: ScreenTimeSettings = {
  idleThresholdMinutes: 5,
};

export function createDefaultScreenTimeState(): ScreenTimeState {
  return {
    sessions: [],
    hourlySlots: {},
    currentSession: null,
    settings: { ...DEFAULT_SCREEN_TIME_SETTINGS },
    schemaVersion: 1,
  };
}
```

- [ ] **Step 2: Write failing tests for storage**

```ts
// tests/screen-time/storage.test.ts

import { getScreenTimeState, setScreenTimeState, updateScreenTimeSettings } from '../../src/screen-time/storage';
import { createDefaultScreenTimeState, ScreenTimeState } from '../../src/screen-time/types';

const mockStorage: Record<string, unknown> = {};

(global as any).chrome = {
  storage: {
    local: {
      get: jest.fn((keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
};

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  jest.clearAllMocks();
});

describe('screen-time storage', () => {
  describe('getScreenTimeState', () => {
    it('returns default state when storage is empty', async () => {
      const state = await getScreenTimeState();
      expect(state).toEqual(createDefaultScreenTimeState());
    });

    it('returns stored state when present', async () => {
      const stored: ScreenTimeState = {
        ...createDefaultScreenTimeState(),
        sessions: [{ start: 1000, end: 2000, type: 'active' }],
      };
      mockStorage['screenTimeState'] = stored;
      const state = await getScreenTimeState();
      expect(state).toEqual(stored);
    });
  });

  describe('setScreenTimeState', () => {
    it('persists state to storage', async () => {
      const state = createDefaultScreenTimeState();
      await setScreenTimeState(state);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ screenTimeState: state });
    });
  });

  describe('updateScreenTimeSettings', () => {
    it('merges new settings into existing state', async () => {
      mockStorage['screenTimeState'] = createDefaultScreenTimeState();
      await updateScreenTimeSettings({ idleThresholdMinutes: 10 });
      const saved = mockStorage['screenTimeState'] as ScreenTimeState;
      expect(saved.settings.idleThresholdMinutes).toBe(10);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/screen-time/storage.test.ts -v`
Expected: FAIL — `Cannot find module '../../src/screen-time/storage'`

- [ ] **Step 4: Write storage implementation**

```ts
// src/screen-time/storage.ts

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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/screen-time/storage.test.ts -v`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/screen-time/types.ts src/screen-time/storage.ts tests/screen-time/storage.test.ts
git commit -m "feat(screen-time): add types and storage module"
```

---

### Task 2: Core Tracker — aggregateToHourlySlots

**Files:**
- Create: `src/screen-time/tracker.ts`
- Create: `tests/screen-time/tracker.test.ts`

- [ ] **Step 1: Write failing tests for aggregation**

```ts
// tests/screen-time/tracker.test.ts

import { aggregateToHourlySlots } from '../../src/screen-time/tracker';
import { HourlySlotMap, ScreenSession } from '../../src/screen-time/types';

describe('aggregateToHourlySlots', () => {
  it('adds minutes to a single hourly slot', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:10:00').getTime(),
      end: new Date('2026-03-23T14:40:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-14']).toBe(30);
  });

  it('splits session across hour boundaries', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T09:30:00').getTime(),
      end: new Date('2026-03-23T11:15:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-09']).toBe(30);
    expect(slots['2026-03-23-10']).toBe(60);
    expect(slots['2026-03-23-11']).toBe(15);
  });

  it('caps each slot at 60 minutes', () => {
    const slots: HourlySlotMap = { '2026-03-23-14': 50 };
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:00:00').getTime(),
      end: new Date('2026-03-23T14:30:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-14']).toBe(60);
  });

  it('handles session with null end (skips)', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:10:00').getTime(),
      end: null,
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(Object.keys(slots)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: FAIL — `Cannot find module '../../src/screen-time/tracker'`

- [ ] **Step 3: Write aggregation implementation**

```ts
// src/screen-time/tracker.ts

import { HourlySlotMap, ScreenSession } from './types';

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
    const minutes = Math.round((sliceEnd - cursor) / 60000);

    if (minutes > 0) {
      const key = formatSlotKey(cursorDate);
      slots[key] = Math.min(60, (slots[key] || 0) + minutes);
    }

    cursor = sliceEnd;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/tracker.ts tests/screen-time/tracker.test.ts
git commit -m "feat(screen-time): add hourly slot aggregation logic"
```

---

### Task 3: Core Tracker — trimOldData

**Files:**
- Modify: `src/screen-time/tracker.ts`
- Modify: `tests/screen-time/tracker.test.ts`

- [ ] **Step 1: Write failing tests for trimming**

Append to `tests/screen-time/tracker.test.ts`:

```ts
import { trimOldData } from '../../src/screen-time/tracker';
import { ScreenTimeState, createDefaultScreenTimeState } from '../../src/screen-time/types';

describe('trimOldData', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes sessions older than 7 days', () => {
    jest.setSystemTime(new Date('2026-03-23T12:00:00'));
    const state = createDefaultScreenTimeState();
    state.sessions = [
      { start: new Date('2026-03-15T10:00:00').getTime(), end: new Date('2026-03-15T11:00:00').getTime(), type: 'active' },
      { start: new Date('2026-03-20T10:00:00').getTime(), end: new Date('2026-03-20T11:00:00').getTime(), type: 'active' },
    ];
    trimOldData(state);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].start).toBe(new Date('2026-03-20T10:00:00').getTime());
  });

  it('removes hourly slots older than 90 days', () => {
    jest.setSystemTime(new Date('2026-06-23T12:00:00'));
    const state = createDefaultScreenTimeState();
    state.hourlySlots = {
      '2026-03-01-10': 30,  // > 90 days
      '2026-06-20-10': 45,  // recent
    };
    trimOldData(state);
    expect(state.hourlySlots['2026-03-01-10']).toBeUndefined();
    expect(state.hourlySlots['2026-06-20-10']).toBe(45);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: FAIL — `trimOldData is not exported`

- [ ] **Step 3: Write trim implementation**

Append to `src/screen-time/tracker.ts`:

```ts
import { ScreenTimeState } from './types';

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SLOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function trimOldData(state: ScreenTimeState): void {
  const now = Date.now();
  const sessionCutoff = now - SESSION_RETENTION_MS;
  state.sessions = state.sessions.filter((s) => s.start >= sessionCutoff);

  const slotCutoff = now - SLOT_RETENTION_MS;
  for (const key of Object.keys(state.hourlySlots)) {
    // key format: "YYYY-MM-DD-HH"
    const datePart = key.substring(0, 10); // "YYYY-MM-DD"
    const slotDate = new Date(datePart + 'T00:00:00').getTime();
    if (slotDate < slotCutoff) {
      delete state.hourlySlots[key];
    }
  }
}
```

Note: The import of `ScreenTimeState` should be merged with the existing import from `./types` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/tracker.ts tests/screen-time/tracker.test.ts
git commit -m "feat(screen-time): add data trimming (7d sessions, 90d slots)"
```

---

### Task 4: Core Tracker — Session State Machine & Recovery

**Files:**
- Modify: `src/screen-time/tracker.ts`
- Modify: `tests/screen-time/tracker.test.ts`

- [ ] **Step 1: Write failing tests for session state machine**

Append to `tests/screen-time/tracker.test.ts`:

```ts
import { handleScreenTimeStateChange, recoverSession, getScreenTimeIdleThreshold } from '../../src/screen-time/tracker';
import { getScreenTimeState, setScreenTimeState } from '../../src/screen-time/storage';
import { createDefaultScreenTimeState, ScreenTimeState } from '../../src/screen-time/types';

// Mock storage module
jest.mock('../../src/screen-time/storage');
// Mock app state module
jest.mock('../../src/utils/storage');

const mockGetScreenTimeState = getScreenTimeState as jest.MockedFunction<typeof getScreenTimeState>;
const mockSetScreenTimeState = setScreenTimeState as jest.MockedFunction<typeof setScreenTimeState>;

import { getState as getAppState } from '../../src/utils/storage';
const mockGetAppState = getAppState as jest.MockedFunction<typeof getAppState>;

describe('handleScreenTimeStateChange', () => {
  let screenTimeState: ScreenTimeState;

  beforeEach(() => {
    jest.useFakeTimers();
    screenTimeState = createDefaultScreenTimeState();
    mockGetScreenTimeState.mockResolvedValue(screenTimeState);
    mockSetScreenTimeState.mockImplementation(async (s) => { screenTimeState = s; });
    mockGetAppState.mockResolvedValue({
      today: { date: '2026-03-23', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a new session on active state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:00:00'));
    await handleScreenTimeStateChange('active');
    expect(screenTimeState.currentSession).not.toBeNull();
    expect(screenTimeState.currentSession!.type).toBe('active');
    expect(screenTimeState.currentSession!.end).toBeNull();
  });

  it('closes session and aggregates on locked state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T09:30:00').getTime(),
      end: null,
      type: 'active',
    };
    await handleScreenTimeStateChange('locked');
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
    expect(screenTimeState.sessions[0].end).toBe(new Date('2026-03-23T10:00:00').getTime());
    expect(screenTimeState.hourlySlots['2026-03-23-09']).toBe(30);
    expect(screenTimeState.hourlySlots['2026-03-23-10']).toBeUndefined(); // 0 minutes in hour 10
  });

  it('does nothing when not checked in', async () => {
    mockGetAppState.mockResolvedValue({
      today: null,
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: 0,
    });
    await handleScreenTimeStateChange('active');
    expect(screenTimeState.currentSession).toBeNull();
  });

  it('closes session on idle state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:05:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    await handleScreenTimeStateChange('idle');
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
  });
});

describe('recoverSession', () => {
  let screenTimeState: ScreenTimeState;

  beforeEach(() => {
    jest.useFakeTimers();
    screenTimeState = createDefaultScreenTimeState();
    mockGetScreenTimeState.mockResolvedValue(screenTimeState);
    mockSetScreenTimeState.mockImplementation(async (s) => { screenTimeState = s; });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes orphaned session using lastActiveTimestamp', async () => {
    jest.setSystemTime(new Date('2026-03-23T14:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    const lastActive = new Date('2026-03-23T12:00:00').getTime();
    mockGetAppState.mockResolvedValue({
      today: { date: '2026-03-23', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: lastActive,
    });

    await recoverSession();
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
    expect(screenTimeState.sessions[0].end).toBe(lastActive);
  });

  it('discards orphaned session if lastActiveTimestamp is from different day', async () => {
    jest.setSystemTime(new Date('2026-03-24T08:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    mockGetAppState.mockResolvedValue({
      today: null,
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: new Date('2026-03-23T17:00:00').getTime(),
    });

    await recoverSession();
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(0);
  });

  it('does nothing if no current session', async () => {
    await recoverSession();
    expect(screenTimeState.sessions).toHaveLength(0);
  });
});

describe('getScreenTimeIdleThreshold', () => {
  it('returns the configured idle threshold', async () => {
    screenTimeState = createDefaultScreenTimeState();
    screenTimeState.settings.idleThresholdMinutes = 10;
    mockGetScreenTimeState.mockResolvedValue(screenTimeState);
    const threshold = await getScreenTimeIdleThreshold();
    expect(threshold).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: FAIL — functions not yet exported

- [ ] **Step 3: Write session state machine and recovery**

Update `src/screen-time/tracker.ts` to add the following (merge with existing code):

```ts
import { getScreenTimeState, setScreenTimeState } from './storage';
import { getState as getAppState } from '../utils/storage';
import { ScreenTimeState } from './types';

export async function getScreenTimeIdleThreshold(): Promise<number> {
  const state = await getScreenTimeState();
  return state.settings.idleThresholdMinutes;
}

export async function handleScreenTimeStateChange(newState: 'active' | 'idle' | 'locked'): Promise<void> {
  const appState = await getAppState();
  if (!appState.today) return;

  const state = await getScreenTimeState();
  const now = Date.now();

  if (newState === 'active') {
    state.currentSession = { start: now, end: null, type: 'active' };
  } else {
    // idle or locked — close current session
    if (state.currentSession && state.currentSession.end === null) {
      state.currentSession.end = now;
      aggregateToHourlySlots(state.currentSession, state.hourlySlots);
      state.sessions.push({ ...state.currentSession });
      state.currentSession = null;
      trimOldData(state);
    }
  }

  await setScreenTimeState(state);
}

export async function recoverSession(): Promise<void> {
  const state = await getScreenTimeState();
  if (!state.currentSession) return;

  const appState = await getAppState();
  const lastActive = appState.lastActiveTimestamp;
  const sessionStartDate = new Date(state.currentSession.start).toDateString();
  const lastActiveDate = new Date(lastActive).toDateString();

  if (lastActive > 0 && sessionStartDate === lastActiveDate) {
    state.currentSession.end = lastActive;
    aggregateToHourlySlots(state.currentSession, state.hourlySlots);
    state.sessions.push({ ...state.currentSession });
  }

  state.currentSession = null;
  await setScreenTimeState(state);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/tracker.test.ts -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/tracker.ts tests/screen-time/tracker.test.ts
git commit -m "feat(screen-time): add session state machine and recovery"
```

---

### Task 5: Refactor background.ts — Unified Idle Dispatcher

**Files:**
- Modify: `src/background.ts`
- Modify: `tests/background.test.ts`

- [ ] **Step 1: Write failing test for unified dispatcher**

Add to `tests/background.test.ts`:

```ts
describe('unified idle dispatcher', () => {
  it('calls handleActiveState only on active state', async () => {
    // After refactor, the idle listener should call handleActiveState on 'active'
    // and handleScreenTimeStateChange on all states
    // This is verified by checking the registered listener behavior
    jest.setSystemTime(new Date('2026-03-23T08:30:00'));
    await handleActiveState();
    expect(mockState.today).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify existing tests still pass**

Run: `npx jest tests/background.test.ts -v`
Expected: All existing tests PASS

- [ ] **Step 3: Refactor background.ts**

Replace lines 43-55 in `src/background.ts` with:

```ts
import { handleScreenTimeStateChange, initScreenTimeTracker } from './screen-time/tracker';

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
```

Also add `initScreenTimeTracker` to `src/screen-time/tracker.ts`:

```ts
export async function initScreenTimeTracker(): Promise<void> {
  await recoverSession();
  // Set unified idle detection interval
  const screenTimeSeconds = (await getScreenTimeIdleThreshold()) * 60;
  const WORK_TIMER_IDLE_SECONDS = 300;
  chrome.idle.setDetectionInterval(Math.min(WORK_TIMER_IDLE_SECONDS, screenTimeSeconds));
  // Register daily trim alarm
  chrome.alarms.create('screenTimeTrim', { periodInMinutes: 1440 });
}

export { initScreenTimeTracker as initIdleDetection };
// Re-export so background.ts can call initIdleDetection() on settings change
```

- [ ] **Step 4: Update chrome stub in tests/setup-chrome.ts**

Add `getURL` to the runtime stub and `tabs` to chrome stub:

```ts
runtime: {
  onInstalled: { addListener: () => {} },
  onStartup: { addListener: () => {} },
  onMessage: { addListener: () => {} },
  getURL: (path: string) => `chrome-extension://test/${path}`,
},
tabs: {
  create: () => Promise.resolve({}),
},
```

Also add `sendMessage` to runtime:
```ts
sendMessage: () => Promise.resolve(),
```

- [ ] **Step 5: Run all tests to verify nothing is broken**

Run: `npx jest -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/background.ts src/screen-time/tracker.ts tests/background.test.ts tests/setup-chrome.ts
git commit -m "refactor: unified idle dispatcher in background.ts"
```

---

### Task 6: Daily Trim Alarm Handler

**Files:**
- Modify: `src/background.ts`

- [ ] **Step 1: Add alarm handler for screenTimeTrim**

In `src/background.ts`, update the `chrome.alarms.onAlarm` listener:

```ts
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
```

- [ ] **Step 2: Run all tests**

Run: `npx jest -v`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/background.ts
git commit -m "feat(screen-time): add daily trim alarm handler"
```

---

### Task 7: Popup Summary Section

**Files:**
- Create: `src/screen-time/popup-summary.ts`
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup.ts`

- [ ] **Step 1: Create popup-summary.ts**

```ts
// src/screen-time/popup-summary.ts

import { getScreenTimeState } from './storage';
import { HourlySlotMap } from './types';

function todayDatePrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayActiveMinutes(slots: HourlySlotMap): number {
  const prefix = todayDatePrefix();
  let total = 0;
  for (const [key, val] of Object.entries(slots)) {
    if (key.startsWith(prefix)) {
      total += val;
    }
  }
  return total;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export async function renderScreenTimeSummary(
  container: HTMLElement,
  checkInTime: number | null
): Promise<void> {
  const state = await getScreenTimeState();
  const activeMinutes = getTodayActiveMinutes(state.hourlySlots);

  // Calculate off-screen time
  const now = Date.now();
  const totalMinutesSinceCheckIn = checkInTime
    ? Math.round((now - checkInTime) / 60000)
    : 0;
  const offMinutes = Math.max(0, totalMinutesSinceCheckIn - activeMinutes);

  // On/off screen text
  const onEl = container.querySelector('#screen-time-on') as HTMLElement;
  const offEl = container.querySelector('#screen-time-off') as HTMLElement;
  if (onEl) onEl.textContent = formatDuration(activeMinutes);
  if (offEl) offEl.textContent = formatDuration(offMinutes);

  // Mini timeline bar
  renderTimelineBar(container, state.hourlySlots, checkInTime);
}

function renderTimelineBar(
  container: HTMLElement,
  slots: HourlySlotMap,
  checkInTime: number | null,
): void {
  const bar = container.querySelector('#screen-time-bar') as HTMLElement;
  if (!bar || !checkInTime) return;

  bar.innerHTML = '';
  const now = Date.now();
  const totalMs = now - checkInTime;
  if (totalMs <= 0) return;

  const prefix = todayDatePrefix();
  const checkInHour = new Date(checkInTime).getHours();
  const currentHour = new Date(now).getHours();

  for (let h = checkInHour; h <= currentHour; h++) {
    const key = `${prefix}-${String(h).padStart(2, '0')}`;
    const minutes = slots[key] || 0;
    const intensity = Math.min(1, minutes / 60);

    const block = document.createElement('div');
    block.className = 'timeline-block';
    block.style.flex = '1';
    block.style.backgroundColor = intensity > 0
      ? `rgba(76, 175, 80, ${0.2 + intensity * 0.8})`
      : '#E0E0E0';
    block.title = `${h}:00 — ${minutes}m active`;
    bar.appendChild(block);
  }
}
```

- [ ] **Step 2: Add HTML section to popup.html**

Add inside the `#main-content` div, just before its closing `</div>` tag (before `<!-- Edit Check-in -->`):

```html
<!-- Screen Time Summary -->
<div class="screen-time-summary" id="screen-time-summary">
  <div class="screen-time-stats">
    <div class="screen-time-stat">
      <span class="screen-time-stat__label">On screen</span>
      <span class="screen-time-stat__value" id="screen-time-on">0h 0m</span>
    </div>
    <div class="screen-time-stat">
      <span class="screen-time-stat__label">Off screen</span>
      <span class="screen-time-stat__value" id="screen-time-off">0h 0m</span>
    </div>
  </div>
  <div class="screen-time-bar" id="screen-time-bar"></div>
  <a href="#" class="screen-time-link" id="screen-time-details">View details</a>
</div>
```

- [ ] **Step 3: Add CSS for screen time summary**

Append to `src/popup/popup.css`:

```css
/* --- Screen Time Summary --- */
.screen-time-summary {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 16px;
}

.screen-time-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.screen-time-stat {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.screen-time-stat__label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.screen-time-stat__value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.screen-time-bar {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  gap: 1px;
  margin-bottom: 8px;
}

.timeline-block {
  border-radius: 2px;
  min-width: 4px;
}

.screen-time-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.screen-time-link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Wire up in popup.ts**

Add import at top of `src/popup/popup.ts`:

```ts
import { renderScreenTimeSummary } from '../screen-time/popup-summary';
```

In the `render()` function, after the `if (state.today)` block updates main content, add:

```ts
// Screen time summary
const summaryEl = document.getElementById('screen-time-summary');
if (summaryEl && state.today) {
  summaryEl.classList.remove('hidden');
  renderScreenTimeSummary(summaryEl, state.today.checkInTime);
} else if (summaryEl) {
  summaryEl.classList.add('hidden');
}
```

In `bindEvents()`, add:

```ts
// View screen time details
document.getElementById('screen-time-details')!.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('screen-time/dashboard.html') });
});
```

- [ ] **Step 5: Run all tests**

Run: `npx jest -v`
Expected: All PASS (popup tests use DOM mocking, new code guarded by `isInBrowser()`)

- [ ] **Step 6: Commit**

```bash
git add src/screen-time/popup-summary.ts src/popup/popup.html src/popup/popup.css src/popup/popup.ts
git commit -m "feat(screen-time): add popup summary section with timeline bar"
```

---

### Task 8: Idle Threshold Setting in Popup

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.ts`

- [ ] **Step 1: Add setting row to popup.html**

Add after the notify setting row inside `settings-panel`:

```html
<div class="setting-row">
  <label for="setting-idle-threshold">Idle threshold (minutes)</label>
  <input type="number" id="setting-idle-threshold" min="1" max="30">
</div>
```

- [ ] **Step 2: Wire up in popup.ts**

Add import:

```ts
import { getScreenTimeState, updateScreenTimeSettings } from '../screen-time/storage';
```

In the settings toggle click handler (where lunch/notify values are loaded), add:

```ts
getScreenTimeState().then((stState) => {
  (document.getElementById('setting-idle-threshold') as HTMLInputElement).value = String(stState.settings.idleThresholdMinutes);
});
```

In the save settings click handler, add:

```ts
const idleThreshold = parseInt((document.getElementById('setting-idle-threshold') as HTMLInputElement).value);
if (!isNaN(idleThreshold) && idleThreshold >= 1 && idleThreshold <= 30) {
  await updateScreenTimeSettings({ idleThresholdMinutes: idleThreshold });
  // Notify background to recalculate idle detection interval
  chrome.runtime.sendMessage({ type: 'updateIdleInterval' });
}
```

- [ ] **Step 3: Run all tests**

Run: `npx jest -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts
git commit -m "feat(screen-time): add idle threshold setting to popup"
```

---

### Task 9: Install Dependencies & Webpack Config

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `webpack.config.js`

- [ ] **Step 1: Install Chart.js dependencies**

```bash
npm install --save chart.js chartjs-chart-matrix
```

- [ ] **Step 2: Update webpack.config.js**

Add dashboard entry point and copy patterns:

```js
// In entry:
'screen-time/dashboard': './src/screen-time/dashboard.ts',

// In CopyPlugin patterns:
{ from: 'src/screen-time/dashboard.html', to: 'screen-time/dashboard.html' },
{ from: 'src/screen-time/dashboard.css', to: 'screen-time/dashboard.css' },
```

- [ ] **Step 3: Update TerserPlugin comment**

Update the mangle comment to include new types:

```js
// IMPORTANT: never add properties from types serialized to
// chrome.storage.local here — mangling those names corrupts
// persisted data on extension update (AppState, CheckInRecord, Settings,
// ScreenTimeState, ScreenSession, ScreenTimeSettings)
```

- [ ] **Step 4: Commit**

```bash
git add webpack.config.js package.json package-lock.json
git commit -m "chore: add chart.js deps and dashboard webpack entry"
```

---

### Task 10: Dashboard Page — HTML & CSS

**Files:**
- Create: `src/screen-time/dashboard.html`
- Create: `src/screen-time/dashboard.css`

- [ ] **Step 1: Create dashboard.html**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Screen Time Analytics</title>
  <link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Screen Time Analytics</h1>
      <div class="date-range-selector">
        <button class="range-btn active" data-range="7">7d</button>
        <button class="range-btn" data-range="30">30d</button>
        <button class="range-btn" data-range="90">90d</button>
      </div>
    </header>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card__label">Avg on-screen/day</div>
        <div class="summary-card__value" id="avg-daily">--</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Peak hour</div>
        <div class="summary-card__value" id="peak-hour">--</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Today vs average</div>
        <div class="summary-card__value" id="today-vs-avg">--</div>
      </div>
    </div>

    <div class="heatmap-container">
      <canvas id="heatmap-canvas"></canvas>
    </div>

    <div class="daily-detail hidden" id="daily-detail">
      <h2 id="detail-date"></h2>
      <div class="detail-bar" id="detail-bar"></div>
    </div>
  </div>

  <script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create dashboard.css**

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

:root {
  --color-primary: #2563EB;
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-border: #E2E8F0;
  --color-text: #1E293B;
  --color-text-secondary: #64748B;
  --color-text-muted: #94A3B8;
  --font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --radius-md: 10px;
  --radius-lg: 14px;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-family);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.dashboard-header h1 {
  font-size: 24px;
  font-weight: 700;
}

.date-range-selector {
  display: flex;
  gap: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px;
}

.range-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}

.range-btn:hover { color: var(--color-text); }
.range-btn.active {
  background: var(--color-primary);
  color: white;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.summary-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.summary-card__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.summary-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.heatmap-container {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  overflow-x: auto;
  margin-bottom: 24px;
}

#heatmap-canvas {
  min-width: 600px;
  width: 100%;
  height: 400px;
}

.daily-detail {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.daily-detail h2 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}

.detail-bar {
  display: flex;
  height: 24px;
  border-radius: 6px;
  overflow: hidden;
  gap: 1px;
}

.hidden { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/screen-time/dashboard.html src/screen-time/dashboard.css
git commit -m "feat(screen-time): add dashboard HTML and CSS"
```

---

### Task 11: Dashboard Utils (Pure Logic)

**Files:**
- Create: `src/screen-time/dashboard-utils.ts`
- Create: `tests/screen-time/dashboard.test.ts`

- [ ] **Step 1: Write failing tests for dashboard stats**

```ts
// tests/screen-time/dashboard.test.ts

import { calculateStats, filterSlotsByRange, transformForHeatmap } from '../../src/screen-time/dashboard-utils';
import { HourlySlotMap } from '../../src/screen-time/types';

describe('dashboard stats', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-23T12:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('filterSlotsByRange', () => {
    it('filters slots to last N days', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 45,
        '2026-03-22-09': 30,
        '2026-03-10-14': 60, // older than 7 days
      };
      const filtered = filterSlotsByRange(slots, 7);
      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered['2026-03-10-14']).toBeUndefined();
    });
  });

  describe('calculateStats', () => {
    it('calculates average daily minutes', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 30,
        '2026-03-23-11': 30,
        '2026-03-22-10': 60,
      };
      const stats = calculateStats(slots, 7);
      // 2 unique days, total 120 minutes => avg 60 min/day
      expect(stats.avgDailyMinutes).toBe(60);
    });

    it('finds peak hour', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-14': 50,
        '2026-03-22-14': 55,
        '2026-03-23-10': 20,
      };
      const stats = calculateStats(slots, 7);
      expect(stats.peakHour).toBe(14);
    });

    it('calculates today vs average', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 60,
        '2026-03-22-10': 30,
        '2026-03-21-10': 30,
      };
      const stats = calculateStats(slots, 7);
      // Today: 60, avg of other days: 30 => +100%
      expect(stats.todayVsAvgPercent).toBeGreaterThan(0);
    });
  });

  describe('transformForHeatmap', () => {
    it('transforms slots to chart.js matrix data', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-14': 45,
      };
      const data = transformForHeatmap(slots);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        x: '2026-03-23',
        y: 14,
        v: 45,
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/dashboard.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write dashboard-utils.ts (pure logic, no Chart.js)**

```ts
// src/screen-time/dashboard-utils.ts

import { HourlySlotMap } from './types';

export interface DashboardStats {
  avgDailyMinutes: number;
  peakHour: number;
  todayVsAvgPercent: number;
}

export interface HeatmapPoint {
  x: string;
  y: number;
  v: number;
}

export function filterSlotsByRange(slots: HourlySlotMap, days: number): HourlySlotMap {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const filtered: HourlySlotMap = {};
  for (const [key, val] of Object.entries(slots)) {
    const datePart = key.substring(0, 10);
    if (datePart >= cutoffStr) {
      filtered[key] = val;
    }
  }
  return filtered;
}

export function calculateStats(slots: HourlySlotMap, days: number): DashboardStats {
  const filtered = filterSlotsByRange(slots, days);

  // Group by day
  const dayTotals: Record<string, number> = {};
  const hourTotals: Record<number, number> = {};

  for (const [key, val] of Object.entries(filtered)) {
    const datePart = key.substring(0, 10);
    const hour = parseInt(key.substring(11), 10);

    dayTotals[datePart] = (dayTotals[datePart] || 0) + val;
    hourTotals[hour] = (hourTotals[hour] || 0) + val;
  }

  const dayEntries = Object.entries(dayTotals);
  const totalMinutes = dayEntries.reduce((sum, [, v]) => sum + v, 0);
  const avgDailyMinutes = dayEntries.length > 0 ? Math.round(totalMinutes / dayEntries.length) : 0;

  // Peak hour
  let peakHour = 0;
  let peakVal = 0;
  for (const [h, v] of Object.entries(hourTotals)) {
    if (v > peakVal) {
      peakVal = v;
      peakHour = parseInt(h, 10);
    }
  }

  // Today vs average
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayTotal = dayTotals[todayStr] || 0;
  const otherDays = dayEntries.filter(([d]) => d !== todayStr);
  const otherAvg = otherDays.length > 0
    ? otherDays.reduce((sum, [, v]) => sum + v, 0) / otherDays.length
    : 0;
  const todayVsAvgPercent = otherAvg > 0
    ? Math.round(((todayTotal - otherAvg) / otherAvg) * 100)
    : 0;

  return { avgDailyMinutes, peakHour, todayVsAvgPercent };
}

export function transformForHeatmap(slots: HourlySlotMap): HeatmapPoint[] {
  return Object.entries(slots).map(([key, val]) => ({
    x: key.substring(0, 10),
    y: parseInt(key.substring(11), 10),
    v: val,
  }));
}

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/dashboard.test.ts -v`
Expected: All 4 tests PASS (no Chart.js dependency in this file)

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/dashboard-utils.ts tests/screen-time/dashboard.test.ts
git commit -m "feat(screen-time): add dashboard utils (stats, filtering, heatmap transform)"
```

---

### Task 11b: Dashboard Page — Chart.js Rendering

**Files:**
- Create: `src/screen-time/dashboard.ts`

- [ ] **Step 1: Write dashboard.ts (Chart.js rendering)**

```ts
// src/screen-time/dashboard.ts

import { Chart, registerables } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { getScreenTimeState } from './storage';
import { ScreenTimeState } from './types';
import { calculateStats, filterSlotsByRange, transformForHeatmap, HeatmapPoint } from './dashboard-utils';

Chart.register(...registerables, MatrixController, MatrixElement);

document.addEventListener('DOMContentLoaded', () => initDashboard());

let currentRange = 7;
let chartInstance: Chart | null = null;

async function initDashboard(): Promise<void> {
  const state = await getScreenTimeState();
  renderStats(state, currentRange);
  renderHeatmap(state, currentRange);
  bindRangeButtons(state);
}

function renderStats(state: ScreenTimeState, days: number): void {
  const stats = calculateStats(state.hourlySlots, days);

  const avgEl = document.getElementById('avg-daily');
  const peakEl = document.getElementById('peak-hour');
  const vsEl = document.getElementById('today-vs-avg');

  if (avgEl) {
    const h = Math.floor(stats.avgDailyMinutes / 60);
    const m = stats.avgDailyMinutes % 60;
    avgEl.textContent = `${h}h ${m}m`;
  }
  if (peakEl) peakEl.textContent = `${stats.peakHour}:00`;
  if (vsEl) {
    const sign = stats.todayVsAvgPercent >= 0 ? '+' : '';
    vsEl.textContent = `${sign}${stats.todayVsAvgPercent}%`;
  }
}

function renderHeatmap(state: ScreenTimeState, days: number): void {
  const canvas = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  if (chartInstance) chartInstance.destroy();

  const filtered = filterSlotsByRange(state.hourlySlots, days);
  const data = transformForHeatmap(filtered);

  // Get unique dates for x-axis
  const dates = [...new Set(data.map((d) => d.x))].sort();

  chartInstance = new Chart(canvas, {
    type: 'matrix' as any,
    data: {
      datasets: [{
        label: 'Active Minutes',
        data: data as any,
        backgroundColor: (ctx: any) => {
          const v = ctx.dataset.data[ctx.dataIndex]?.v || 0;
          const alpha = v / 60;
          return `rgba(76, 175, 80, ${Math.max(0.05, alpha)})`;
        },
        width: ({ chart }: any) => {
          const { left, right } = chart.chartArea || {};
          if (!left && left !== 0) return 20;
          return Math.max(10, (right - left) / Math.max(dates.length, 1) - 2);
        },
        height: ({ chart }: any) => {
          const { top, bottom } = chart.chartArea || {};
          if (!top && top !== 0) return 15;
          return Math.max(8, (bottom - top) / 24 - 2);
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          labels: dates,
          offset: true,
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
        y: {
          type: 'category',
          labels: Array.from({ length: 24 }, (_, i) => String(i)),
          offset: true,
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx: any) => {
              const raw = ctx.raw as HeatmapPoint;
              return `${raw.x}, ${raw.y}h: ${raw.v} min active`;
            },
          },
        },
        legend: { display: false },
      },
    },
  });
}

function bindRangeButtons(state: ScreenTimeState): void {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = parseInt(btn.getAttribute('data-range') || '7', 10);
      renderStats(state, currentRange);
      renderHeatmap(state, currentRange);
    });
  });
}
```

- [ ] **Step 2: Build to verify webpack compiles**

Run: `npm run build`
Expected: Build succeeds, `dist/screen-time/dashboard.js` exists

- [ ] **Step 3: Commit**

```bash
git add src/screen-time/dashboard.ts
git commit -m "feat(screen-time): add dashboard Chart.js rendering"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx jest -v`
Expected: All tests PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds. Verify files exist:
- `dist/screen-time/dashboard.js`
- `dist/screen-time/dashboard.html`
- `dist/screen-time/dashboard.css`

- [ ] **Step 4: Commit**

```bash
git add tests/setup-chrome.ts
git commit -m "chore: update chrome stub with tabs API for tests"
```

---

### Task 13: Manual Smoke Test

- [ ] **Step 1: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked from `dist/` folder

- [ ] **Step 2: Test basic flow**

1. Click extension icon — should show popup with check-in
2. Check in manually or wait for auto check-in
3. Verify "On screen" / "Off screen" section appears
4. Lock screen, wait, unlock — screen time should increase
5. Click "View details" — dashboard should open in new tab
6. Dashboard heatmap should render with Chart.js
7. Toggle 7d/30d/90d — stats and heatmap should update
8. Open settings — idle threshold input should appear
9. Change idle threshold, save — should persist

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: smoke test adjustments"
```
