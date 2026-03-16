# Work Timer Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that auto-tracks work hours via idle detection, calculates checkout time (8h work + configurable lunch break), and notifies before checkout.

**Architecture:** Manifest V3 extension with a background service worker (idle detection, alarms), a popup UI (display, settings, export), and shared utilities (storage, types). All state persisted in `chrome.storage.local`.

**Tech Stack:** TypeScript, Webpack + ts-loader, Chrome Extension Manifest V3 APIs (idle, alarms, notifications, storage)

**Spec:** `docs/superpowers/specs/2026-03-16-work-timer-chrome-extension-design.md`

---

## File Structure

```
reminder/
├── manifest.json                 # MV3 manifest: permissions, service worker, popup
├── tsconfig.json                 # TypeScript config targeting ES2020
├── package.json                  # Dependencies: typescript, webpack, ts-loader, @types/chrome
├── webpack.config.js             # Two entry points: background.ts → dist/background.js, popup.ts → dist/popup/popup.js
├── src/
│   ├── background.ts             # Service worker: idle detection, check-in logic, alarms, notifications
│   ├── popup/
│   │   ├── popup.html            # Popup markup: header, info panel, settings panel, footer
│   │   ├── popup.css             # Popup styles
│   │   └── popup.ts              # Popup logic: read state, render, handle edits/settings/export
│   └── utils/
│       ├── types.ts              # Shared interfaces: CheckInRecord, Settings, AppState
│       └── storage.ts            # Helpers: getState, setState, getSettings, updateSettings
├── tests/
│   ├── utils/
│   │   ├── types.test.ts         # Type validation tests
│   │   └── storage.test.ts       # Storage helper tests (mocked chrome.storage)
│   ├── background.test.ts        # Background logic tests (mocked chrome APIs)
│   └── popup/
│       └── popup.test.ts         # Popup logic tests
├── jest.config.js                # Jest config for TypeScript
└── dist/                         # Build output (gitignored)
```

---

## Chunk 1: Project Setup & Types

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `webpack.config.js`
- Create: `.gitignore`
- Create: `jest.config.js`

- [ ] **Step 1: Create package.json**

```bash
cd /Users/quannh2871/Development/reminder
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev typescript webpack webpack-cli ts-loader @types/chrome jest ts-jest @types/jest copy-webpack-plugin
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create webpack.config.js**

```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
      ],
    }),
  ],
};
```

- [ ] **Step 5: Create jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 7: Add build and test scripts to package.json**

Add to `scripts` in `package.json`:
```json
{
  "build": "webpack",
  "watch": "webpack --watch",
  "test": "jest"
}
```

- [ ] **Step 8: Verify build runs without errors**

```bash
npx webpack
```

Expected: Build succeeds (will fail with "entry not found" since src files don't exist yet — that's expected at this point).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json webpack.config.js jest.config.js .gitignore
git commit -m "chore: initialize project with TS, Webpack, Jest config"
```

---

### Task 2: Define shared types

**Files:**
- Create: `src/utils/types.ts`
- Create: `tests/utils/types.test.ts`

- [ ] **Step 1: Write type validation test**

Create `tests/utils/types.test.ts`:

```typescript
import { DEFAULT_SETTINGS, createCheckInRecord, createDefaultAppState } from '../../src/utils/types';

describe('types', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('has lunchBreakMinutes of 60', () => {
      expect(DEFAULT_SETTINGS.lunchBreakMinutes).toBe(60);
    });

    it('has notifyBeforeMinutes of 15', () => {
      expect(DEFAULT_SETTINGS.notifyBeforeMinutes).toBe(15);
    });
  });

  describe('createCheckInRecord', () => {
    it('creates a record with given timestamp and correct date', () => {
      const timestamp = new Date('2026-03-16T08:26:00').getTime();
      const record = createCheckInRecord(timestamp, 60);
      expect(record.date).toBe('2026-03-16');
      expect(record.checkInTime).toBe(timestamp);
      expect(record.manualOverride).toBe(false);
    });

    it('calculates expectedCheckoutTime as checkIn + 8h + lunch', () => {
      const timestamp = new Date('2026-03-16T08:00:00').getTime();
      const record = createCheckInRecord(timestamp, 60);
      const expected = timestamp + (8 * 60 + 60) * 60 * 1000; // 8h work + 60min lunch
      expect(record.expectedCheckoutTime).toBe(expected);
    });

    it('calculates correctly with custom lunch break', () => {
      const timestamp = new Date('2026-03-16T08:00:00').getTime();
      const record = createCheckInRecord(timestamp, 90);
      const expected = timestamp + (8 * 60 + 90) * 60 * 1000; // 8h work + 90min lunch
      expect(record.expectedCheckoutTime).toBe(expected);
    });
  });

  describe('createDefaultAppState', () => {
    it('returns state with null today and empty history', () => {
      const state = createDefaultAppState();
      expect(state.today).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.lastActiveTimestamp).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/utils/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement types.ts**

Create `src/utils/types.ts`:

```typescript
export interface CheckInRecord {
  date: string;
  checkInTime: number;
  expectedCheckoutTime: number;
  manualOverride: boolean;
}

export interface Settings {
  lunchBreakMinutes: number;
  notifyBeforeMinutes: number;
}

export interface AppState {
  today: CheckInRecord | null;
  history: CheckInRecord[];
  settings: Settings;
  lastActiveTimestamp: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lunchBreakMinutes: 60,
  notifyBeforeMinutes: 15,
};

export function calculateCheckoutTime(checkInTime: number, lunchBreakMinutes: number): number {
  return checkInTime + (8 * 60 + lunchBreakMinutes) * 60 * 1000;
}

function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createCheckInRecord(checkInTime: number, lunchBreakMinutes: number): CheckInRecord {
  const dateStr = formatDateLocal(new Date(checkInTime));
  return {
    date: dateStr,
    checkInTime,
    expectedCheckoutTime: calculateCheckoutTime(checkInTime, lunchBreakMinutes),
    manualOverride: false,
  };
}

export function todayDateString(): string {
  return formatDateLocal(new Date());
}

export function createDefaultAppState(): AppState {
  return {
    today: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    lastActiveTimestamp: 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/types.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/types.ts tests/utils/types.test.ts
git commit -m "feat: add shared types and factory functions"
```

---

### Task 3: Implement storage helpers

**Files:**
- Create: `src/utils/storage.ts`
- Create: `tests/utils/storage.test.ts`

- [ ] **Step 1: Write storage helper tests**

Create `tests/utils/storage.test.ts`:

```typescript
import { getState, setState, updateSettings } from '../../src/utils/storage';
import { createDefaultAppState, DEFAULT_SETTINGS, AppState } from '../../src/utils/types';

// Mock chrome.storage.local
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

describe('storage', () => {
  describe('getState', () => {
    it('returns default state when storage is empty', async () => {
      const state = await getState();
      expect(state).toEqual(createDefaultAppState());
    });

    it('returns stored state when present', async () => {
      const stored: AppState = {
        today: { date: '2026-03-16', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
        history: [],
        settings: DEFAULT_SETTINGS,
        lastActiveTimestamp: 500,
      };
      mockStorage['appState'] = stored;
      const state = await getState();
      expect(state).toEqual(stored);
    });
  });

  describe('setState', () => {
    it('persists state to storage', async () => {
      const state = createDefaultAppState();
      state.lastActiveTimestamp = 12345;
      await setState(state);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ appState: state });
    });
  });

  describe('updateSettings', () => {
    it('merges new settings into existing state', async () => {
      const state = createDefaultAppState();
      mockStorage['appState'] = state;
      await updateSettings({ lunchBreakMinutes: 90 });
      const saved = mockStorage['appState'] as AppState;
      expect(saved.settings.lunchBreakMinutes).toBe(90);
      expect(saved.settings.notifyBeforeMinutes).toBe(15);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/utils/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement storage.ts**

Create `src/utils/storage.ts`:

```typescript
import { AppState, Settings, createDefaultAppState } from './types';

const STORAGE_KEY = 'appState';

export async function getState(): Promise<AppState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] ?? createDefaultAppState();
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/storage.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/storage.ts tests/utils/storage.test.ts
git commit -m "feat: add storage helpers with chrome.storage.local"
```

---

## Chunk 2: Background Service Worker

### Task 4: Implement background service worker — check-in logic

**Files:**
- Create: `src/background.ts`
- Create: `tests/background.test.ts`

- [ ] **Step 1: Write check-in logic tests**

Create `tests/background.test.ts`:

```typescript
import { handleActiveState, IDLE_THRESHOLD_MS } from '../src/background';
import { AppState, createDefaultAppState, DEFAULT_SETTINGS } from '../src/utils/types';

let mockState: AppState;

// Mock chrome APIs
(global as any).chrome = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({ appState: mockState })),
      set: jest.fn((items: Record<string, unknown>) => {
        mockState = items['appState'] as AppState;
        return Promise.resolve();
      }),
    },
  },
  idle: {
    setDetectionInterval: jest.fn(),
    onStateChanged: { addListener: jest.fn() },
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve(null)),
    onAlarm: { addListener: jest.fn() },
  },
  notifications: {
    create: jest.fn(),
    getPermissionLevel: jest.fn(() => Promise.resolve('granted')),
  },
  runtime: {
    onInstalled: { addListener: jest.fn() },
  },
};

beforeEach(() => {
  mockState = createDefaultAppState();
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('handleActiveState', () => {
  it('creates check-in when today is null (first install)', async () => {
    jest.setSystemTime(new Date('2026-03-16T08:26:00'));
    await handleActiveState();
    expect(mockState.today).not.toBeNull();
    expect(mockState.today!.date).toBe('2026-03-16');
    expect(mockState.today!.manualOverride).toBe(false);
  });

  it('creates new check-in when date changes', async () => {
    jest.setSystemTime(new Date('2026-03-17T08:30:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T17:30:00').getTime();

    await handleActiveState();

    expect(mockState.today!.date).toBe('2026-03-17');
    expect(mockState.history).toHaveLength(1);
    expect(mockState.history[0].date).toBe('2026-03-16');
  });

  it('does not overwrite check-in on same day', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    const originalCheckIn = new Date('2026-03-16T08:26:00').getTime();
    mockState.today = {
      date: '2026-03-16',
      checkInTime: originalCheckIn,
      expectedCheckoutTime: originalCheckIn + (8 * 60 + 60) * 60 * 1000,
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:55:00').getTime();

    await handleActiveState();

    expect(mockState.today!.checkInTime).toBe(originalCheckIn);
  });

  it('creates alarm when creating new check-in', async () => {
    jest.setSystemTime(new Date('2026-03-16T08:00:00'));
    await handleActiveState();
    expect(chrome.alarms.create).toHaveBeenCalledWith('checkout-reminder', {
      when: mockState.today!.expectedCheckoutTime - DEFAULT_SETTINGS.notifyBeforeMinutes * 60000,
    });
  });

  it('does not overwrite manual override on same day', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    const manualTime = new Date('2026-03-16T08:00:00').getTime();
    mockState.today = {
      date: '2026-03-16',
      checkInTime: manualTime,
      expectedCheckoutTime: manualTime + (8 * 60 + 60) * 60 * 1000,
      manualOverride: true,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:00:00').getTime();

    await handleActiveState();

    expect(mockState.today!.checkInTime).toBe(manualTime);
    expect(mockState.today!.manualOverride).toBe(true);
  });

  it('trims history to 90 entries', async () => {
    jest.setSystemTime(new Date('2026-06-16T08:00:00'));
    mockState.history = Array.from({ length: 90 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      checkInTime: 1000 * i,
      expectedCheckoutTime: 2000 * i,
      manualOverride: false,
    }));
    mockState.today = {
      date: '2026-06-15',
      checkInTime: 1000,
      expectedCheckoutTime: 2000,
      manualOverride: false,
    };

    await handleActiveState();

    expect(mockState.history.length).toBeLessThanOrEqual(90);
  });

  it('updates lastActiveTimestamp on every active event', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:55:00').getTime();

    await handleActiveState();

    expect(mockState.lastActiveTimestamp).toBe(new Date('2026-03-16T10:00:00').getTime());
  });
});

describe('verifyAlarmExists', () => {
  it('recreates alarm if today has check-in but alarm is missing', async () => {
    jest.setSystemTime(new Date('2026-03-16T12:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    (chrome.alarms.get as jest.Mock).mockResolvedValueOnce(null);

    const { verifyAlarmExists } = require('../src/background');
    await verifyAlarmExists();

    expect(chrome.alarms.create).toHaveBeenCalledWith('checkout-reminder', {
      when: mockState.today!.expectedCheckoutTime - DEFAULT_SETTINGS.notifyBeforeMinutes * 60000,
    });
  });

  it('does not recreate alarm if alarm already exists', async () => {
    jest.setSystemTime(new Date('2026-03-16T12:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    (chrome.alarms.get as jest.Mock).mockResolvedValueOnce({ name: 'checkout-reminder' });

    const { verifyAlarmExists } = require('../src/background');
    await verifyAlarmExists();

    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

describe('handleCheckoutAlarm', () => {
  it('creates notification when permission is granted', async () => {
    mockState.settings.notifyBeforeMinutes = 15;
    (chrome.notifications.getPermissionLevel as jest.Mock).mockResolvedValueOnce('granted');

    const { handleCheckoutAlarm } = require('../src/background');
    await handleCheckoutAlarm();

    expect(chrome.notifications.create).toHaveBeenCalledWith('checkout-notify', expect.objectContaining({
      type: 'basic',
      title: 'Work Timer',
    }));
  });

  it('does not create notification when permission is denied', async () => {
    (chrome.notifications.getPermissionLevel as jest.Mock).mockResolvedValueOnce('denied');

    const { handleCheckoutAlarm } = require('../src/background');
    await handleCheckoutAlarm();

    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/background.test.ts
```

Expected: FAIL — `handleActiveState` not found.

- [ ] **Step 3: Implement background.ts**

Create `src/background.ts`:

```typescript
import { getState, setState, trimHistory } from './utils/storage';
import { createCheckInRecord, todayDateString } from './utils/types';

export const IDLE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function handleActiveState(): Promise<void> {
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
}

function createCheckoutAlarm(expectedCheckoutTime: number, notifyBeforeMinutes: number): void {
  chrome.alarms.create('checkout-reminder', {
    when: expectedCheckoutTime - notifyBeforeMinutes * 60000,
  });
}

// --- Service Worker Initialization (top-level) ---

chrome.idle.setDetectionInterval(300);

chrome.idle.onStateChanged.addListener(async (newState: chrome.idle.IdleState) => {
  if (newState === 'active') {
    await handleActiveState();
  }
});

export async function handleCheckoutAlarm(): Promise<void> {
  const permLevel = await chrome.notifications.getPermissionLevel();
  if (permLevel === 'granted') {
    const state = await getState();
    const mins = state.settings.notifyBeforeMinutes;
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

// On service worker restart, verify alarm exists
verifyAlarmExists();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/background.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background.ts tests/background.test.ts
git commit -m "feat: add background service worker with idle detection and check-in logic"
```

---

## Chunk 3: Manifest & Popup UI

### Task 5: Create manifest.json

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Work Timer",
  "version": "1.0.0",
  "description": "Auto-track work hours with check-in detection and checkout reminders",
  "permissions": ["idle", "storage", "alarms", "notifications"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Create placeholder icons directory**

```bash
mkdir -p src/icons
```

Create simple placeholder icons (16x16, 48x48, 128x128 PNG files). For development, use any solid-color square PNGs. Update webpack to copy icons:

Add to `webpack.config.js` CopyPlugin patterns:
```javascript
{ from: 'src/icons', to: 'icons' },
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json src/icons webpack.config.js
git commit -m "feat: add Chrome extension manifest and placeholder icons"
```

---

### Task 6: Build popup HTML and CSS

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`

- [ ] **Step 1: Create popup.html**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <h1 class="date" id="current-date"></h1>
    </header>

    <!-- Main Info -->
    <section class="info-panel">
      <div class="info-row">
        <span class="label">Check-in:</span>
        <span class="value" id="checkin-time"></span>
        <button class="btn-icon" id="btn-edit-checkin" title="Edit">&#9998;</button>
      </div>
      <div class="info-row edit-row hidden" id="edit-checkin-row">
        <input type="time" id="checkin-input">
        <button class="btn-small" id="btn-save-checkin">Save</button>
        <button class="btn-small" id="btn-cancel-checkin">Cancel</button>
      </div>
      <div class="info-row">
        <span class="label">Lunch break:</span>
        <span class="value" id="lunch-break"></span>
      </div>
      <div class="info-row">
        <span class="label">Checkout:</span>
        <span class="value" id="checkout-time"></span>
      </div>
      <div class="info-row">
        <span class="label">Remaining:</span>
        <span class="value countdown" id="remaining-time"></span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </section>

    <!-- Notification Warning -->
    <div class="notification-warning hidden" id="notification-warning">
      <span>Notifications are disabled</span>
      <button class="btn-small" id="btn-enable-notify">Enable</button>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <select id="export-format">
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
      <button class="btn" id="btn-export">Export</button>
      <button class="btn" id="btn-settings">Settings</button>
    </footer>

    <!-- Settings Panel -->
    <section class="settings-panel hidden" id="settings-panel">
      <h2>Settings</h2>
      <div class="setting-row">
        <label for="setting-lunch">Lunch break (minutes):</label>
        <input type="number" id="setting-lunch" min="0" max="180">
      </div>
      <div class="setting-row">
        <label for="setting-notify">Notify before (minutes):</label>
        <input type="number" id="setting-notify" min="1" max="60">
      </div>
      <button class="btn" id="btn-save-settings">Save</button>
    </section>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333;
  background: #fff;
}

.container {
  padding: 16px;
}

.header {
  text-align: center;
  margin-bottom: 16px;
}

.header h1 {
  font-size: 16px;
  font-weight: 600;
  color: #555;
}

.info-panel {
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 6px 0;
}

.label {
  flex: 0 0 100px;
  color: #777;
}

.value {
  flex: 1;
  font-weight: 600;
}

.countdown {
  color: #2563eb;
  font-size: 18px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  color: #999;
}

.btn-icon:hover {
  color: #333;
}

.edit-row {
  padding-left: 100px;
  gap: 8px;
}

.edit-row input[type="time"] {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.progress-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 3px;
  transition: width 0.3s;
  width: 0%;
}

.notification-warning {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #dc2626;
}

.footer {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f9fafb;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover {
  background: #f3f4f6;
}

.btn-small {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f9fafb;
  cursor: pointer;
  font-size: 12px;
}

.settings-panel {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.settings-panel h2 {
  font-size: 14px;
  margin-bottom: 8px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.setting-row label {
  font-size: 13px;
  color: #555;
}

.setting-row input {
  width: 70px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.hidden {
  display: none !important;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/popup/popup.html src/popup/popup.css
git commit -m "feat: add popup HTML and CSS"
```

---

### Task 7: Implement popup logic

**Files:**
- Create: `src/popup/popup.ts`
- Create: `tests/popup/popup.test.ts`

- [ ] **Step 1: Write popup helper tests**

Create `tests/popup/popup.test.ts`:

```typescript
import { formatTime, formatRemaining, calculateProgress } from '../../src/popup/popup';

describe('popup helpers', () => {
  describe('formatTime', () => {
    it('formats timestamp to HH:mm', () => {
      const ts = new Date('2026-03-16T08:26:00').getTime();
      expect(formatTime(ts)).toBe('08:26');
    });

    it('formats afternoon time', () => {
      const ts = new Date('2026-03-16T17:05:00').getTime();
      expect(formatTime(ts)).toBe('17:05');
    });
  });

  describe('formatRemaining', () => {
    it('returns hours and minutes', () => {
      const ms = 3 * 60 * 60 * 1000 + 25 * 60 * 1000; // 3h 25m
      expect(formatRemaining(ms)).toBe('3h 25m');
    });

    it('returns 0h 0m for zero or negative', () => {
      expect(formatRemaining(0)).toBe('0h 0m');
      expect(formatRemaining(-1000)).toBe('0h 0m');
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 at check-in time', () => {
      const checkIn = 1000;
      const checkout = 2000;
      expect(calculateProgress(checkIn, checkout, checkIn)).toBe(0);
    });

    it('returns 100 at checkout time', () => {
      const checkIn = 1000;
      const checkout = 2000;
      expect(calculateProgress(checkIn, checkout, checkout)).toBe(100);
    });

    it('returns 50 at midpoint', () => {
      const checkIn = 1000;
      const checkout = 3000;
      expect(calculateProgress(checkIn, checkout, 2000)).toBe(50);
    });

    it('caps at 100', () => {
      expect(calculateProgress(1000, 2000, 5000)).toBe(100);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/popup/popup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement popup.ts**

Create `src/popup/popup.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/popup/popup.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.ts tests/popup/popup.test.ts
git commit -m "feat: add popup logic with countdown, settings, export"
```

---

## Chunk 4: Build, Verify & Polish

### Task 8: Build and verify the extension loads in Chrome

**Files:**
- Modify: `webpack.config.js` (if needed)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 2: Build the extension**

```bash
npm run build
```

Expected: `dist/` folder created with `background.js`, `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `manifest.json`, `icons/`.

- [ ] **Step 3: Verify dist structure**

```bash
ls -R dist/
```

Expected output should include all required files for Chrome to load the extension.

- [ ] **Step 4: Manual verification checklist**

Load unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked → select `dist/`):
- Extension icon appears in toolbar
- Click icon → popup opens showing date, "--:--" for check-in (or auto-detected time)
- Settings button toggles settings panel
- Edit check-in time works
- Export downloads CSV file

- [ ] **Step 5: Commit**

```bash
git add manifest.json webpack.config.js src/icons/
git commit -m "chore: verify build and extension loading"
```

---

### Task 9: Run all tests and final commit

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 2: Build clean**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Final commit with all remaining files**

```bash
git status
# Add any remaining tracked/new files explicitly
git commit -m "feat: complete Work Timer Chrome extension v1.0.0"
```
