# Cross-Profile Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Work Timer AppState across multiple Chrome profiles and Chromium-based browsers on the same machine using Chrome Native Messaging and a shared `~/.worktimer/data.json` file.

**Architecture:** A native host Node.js script reads/writes a shared JSON file atomically. All Chrome profiles call this host via `chrome.runtime.sendNativeMessage()` from `popup.ts` only (Service Workers cannot use this API). On popup open, the extension reads the shared file, merges with local `chrome.storage.local` state using last-write-wins logic, then persists the merged state to both stores.

**Tech Stack:** TypeScript, Chrome Extension MV3, Node.js (native host), Jest (tests), Webpack

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/utils/types.ts` | Modify | Add `lastModified` to `Settings`, update `DEFAULT_SETTINGS` |
| `src/utils/storage.ts` | Modify | `updateSettings()` stamps `lastModified: Date.now()` |
| `src/utils/merge.ts` | Create | `mergeStates()` — pure merge logic, no side effects |
| `src/utils/sync.ts` | Create | `readSharedState()` / `writeSharedState()` — native messaging wrapper |
| `src/popup/popup.ts` | Modify | Export `syncOnOpen()`, call it in `init()` before render |
| `manifest.json` | Modify | Add `"nativeMessaging"` to permissions |
| `native-host/worktimer-host.js` | Create | Node.js native messaging host — reads/writes `~/.worktimer/data.json` |
| `native-host/com.worktimer.host.json` | Create | Manifest template (placeholders for install script) |
| `install.sh` | Create | One-time setup: detects browsers, installs manifests |
| `tests/utils/merge.test.ts` | Create | Tests for all merge logic |
| `tests/utils/sync.test.ts` | Create | Tests for native messaging wrapper |
| `tests/popup/sync-on-open.test.ts` | Create | Tests for `syncOnOpen()` orchestration |
| `tests/utils/storage.test.ts` | Modify | Add test for `lastModified` stamping |
| `tests/utils/types.test.ts` | Modify | Add test for `lastModified` in `DEFAULT_SETTINGS` |

---

## Chunk 1: Data Model, Merge Logic, Sync Layer

### Task 1: Add `lastModified` to Settings type

**Files:**
- Modify: `src/utils/types.ts`
- Modify: `tests/utils/types.test.ts`

- [ ] **Step 1: Write failing tests**

Open `tests/utils/types.test.ts`. Add at the bottom:

```typescript
describe('DEFAULT_SETTINGS', () => {
  it('includes lastModified defaulting to 0', () => {
    expect(DEFAULT_SETTINGS.lastModified).toBe(0);
  });
});

describe('createDefaultAppState', () => {
  it('settings include lastModified 0', () => {
    const state = createDefaultAppState();
    expect(state.settings.lastModified).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest tests/utils/types.test.ts --verbose
```

Expected: FAIL — `received undefined, expected 0`

- [ ] **Step 3: Update `src/utils/types.ts`**

Change the `Settings` interface:

```typescript
export interface Settings {
  lunchBreakMinutes: number;
  notifyBeforeMinutes: number;
  lastModified: number;
}
```

Change `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: Settings = {
  lunchBreakMinutes: 60,
  notifyBeforeMinutes: 15,
  lastModified: 0,
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest tests/utils/types.test.ts --verbose
```

Expected: PASS

- [ ] **Step 5: Run full suite to check regressions**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/types.ts tests/utils/types.test.ts
git commit -m "feat: add lastModified to Settings type and DEFAULT_SETTINGS"
```

---

### Task 2: Update `updateSettings()` to stamp `lastModified`

**Files:**
- Modify: `src/utils/storage.ts`
- Modify: `tests/utils/storage.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/utils/storage.test.ts`, add inside the existing `describe('updateSettings')` block:

```typescript
it('stamps lastModified with current timestamp', async () => {
  const before = Date.now();
  const state = createDefaultAppState();
  mockStorage['appState'] = state;
  await updateSettings({ lunchBreakMinutes: 90 });
  const after = Date.now();
  const saved = mockStorage['appState'] as AppState;
  expect(saved.settings.lastModified).toBeGreaterThanOrEqual(before);
  expect(saved.settings.lastModified).toBeLessThanOrEqual(after);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest tests/utils/storage.test.ts --verbose
```

Expected: FAIL — `lastModified` is 0, not a recent timestamp

- [ ] **Step 3: Update `updateSettings()` in `src/utils/storage.ts`**

Change the signature and body (the `Omit` prevents callers from passing `lastModified` — the function always stamps it):

```typescript
export async function updateSettings(partial: Partial<Omit<Settings, 'lastModified'>>): Promise<AppState> {
  const state = await getState();
  state.settings = { ...state.settings, ...partial, lastModified: Date.now() };
  await setState(state);
  return state;
}
```

Also add `Settings` to the imports if not already imported:

```typescript
import { AppState, Settings, createDefaultAppState } from './types';
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest tests/utils/storage.test.ts --verbose
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/storage.ts tests/utils/storage.test.ts
git commit -m "feat: stamp lastModified on every updateSettings() call"
```

---

### Task 3: Write merge logic

**Files:**
- Create: `src/utils/merge.ts`
- Create: `tests/utils/merge.test.ts`

The merge function is pure — no I/O, no side effects. Takes two `AppState` objects and returns one.

- [ ] **Step 1: Create failing tests**

Create `tests/utils/merge.test.ts`:

```typescript
import { mergeStates } from '../../src/utils/merge';
import { AppState, CheckInRecord, createDefaultAppState, DEFAULT_SETTINGS } from '../../src/utils/types';

function makeState(overrides: Partial<AppState> = {}): AppState {
  return { ...createDefaultAppState(), ...overrides };
}

function makeRecord(checkInTime: number, manualOverride = false): CheckInRecord {
  return {
    date: '2026-03-20',
    checkInTime,
    expectedCheckoutTime: checkInTime + 9 * 60 * 60 * 1000,
    manualOverride,
  };
}

describe('mergeStates', () => {
  describe('when shared is null', () => {
    it('returns local state unchanged', () => {
      const local = makeState({ lastActiveTimestamp: 100 });
      expect(mergeStates(null, local)).toEqual(local);
    });
  });

  describe('today selection', () => {
    it('uses local today when shared.today is null', () => {
      const shared = makeState({ today: null, lastActiveTimestamp: 200 });
      const local = makeState({ today: makeRecord(1000), lastActiveTimestamp: 100 });
      expect(mergeStates(shared, local).today).toEqual(makeRecord(1000));
    });

    it('uses shared today when local.today is null', () => {
      const shared = makeState({ today: makeRecord(1000), lastActiveTimestamp: 200 });
      const local = makeState({ today: null, lastActiveTimestamp: 100 });
      expect(mergeStates(shared, local).today).toEqual(makeRecord(1000));
    });

    it('uses shared today when shared lastActiveTimestamp is higher', () => {
      const shared = makeState({ today: makeRecord(2000), lastActiveTimestamp: 300 });
      const local = makeState({ today: makeRecord(1000), lastActiveTimestamp: 100 });
      expect(mergeStates(shared, local).today?.checkInTime).toBe(2000);
    });

    it('uses local today when local lastActiveTimestamp is higher', () => {
      const shared = makeState({ today: makeRecord(1000), lastActiveTimestamp: 100 });
      const local = makeState({ today: makeRecord(2000), lastActiveTimestamp: 300 });
      expect(mergeStates(shared, local).today?.checkInTime).toBe(2000);
    });

    it('prefers shared today when shared has manualOverride=true, local does not', () => {
      const shared = makeState({ today: makeRecord(1000, true), lastActiveTimestamp: 100 });
      const local = makeState({ today: makeRecord(2000, false), lastActiveTimestamp: 300 });
      expect(mergeStates(shared, local).today?.checkInTime).toBe(1000);
    });

    it('prefers local today when local has manualOverride=true, shared does not', () => {
      const shared = makeState({ today: makeRecord(2000, false), lastActiveTimestamp: 300 });
      const local = makeState({ today: makeRecord(1000, true), lastActiveTimestamp: 100 });
      expect(mergeStates(shared, local).today?.checkInTime).toBe(1000);
    });
  });

  describe('history merge', () => {
    it('unions history from both sides', () => {
      const shared = makeState({
        history: [{ date: '2026-03-19', checkInTime: 100, expectedCheckoutTime: 200, manualOverride: false }],
      });
      const local = makeState({
        history: [{ date: '2026-03-18', checkInTime: 50, expectedCheckoutTime: 150, manualOverride: false }],
      });
      expect(mergeStates(shared, local).history).toHaveLength(2);
    });

    it('deduplicates by date, preferring manualOverride=true over false', () => {
      const shared = makeState({
        history: [{ date: '2026-03-19', checkInTime: 100, expectedCheckoutTime: 200, manualOverride: false }],
      });
      const local = makeState({
        history: [{ date: '2026-03-19', checkInTime: 50, expectedCheckoutTime: 150, manualOverride: true }],
      });
      const result = mergeStates(shared, local);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].manualOverride).toBe(true);
    });

    it('when both have manualOverride=true, prefers the more recent checkInTime', () => {
      const shared = makeState({
        history: [{ date: '2026-03-19', checkInTime: 50, expectedCheckoutTime: 150, manualOverride: true }],
      });
      const local = makeState({
        history: [{ date: '2026-03-19', checkInTime: 100, expectedCheckoutTime: 200, manualOverride: true }],
      });
      const result = mergeStates(shared, local);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].checkInTime).toBe(100);
    });

    it('sorts history ascending by date', () => {
      const shared = makeState({
        history: [{ date: '2026-03-20', checkInTime: 100, expectedCheckoutTime: 200, manualOverride: false }],
      });
      const local = makeState({
        history: [{ date: '2026-03-18', checkInTime: 50, expectedCheckoutTime: 150, manualOverride: false }],
      });
      const result = mergeStates(shared, local);
      expect(result.history[0].date).toBe('2026-03-18');
      expect(result.history[1].date).toBe('2026-03-20');
    });

    it('trims to 90 entries keeping the newest', () => {
      const history91 = Array.from({ length: 91 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        checkInTime: i * 1000,
        expectedCheckoutTime: i * 1000 + 100,
        manualOverride: false,
      }));
      const shared = makeState({ history: history91 });
      const local = makeState({ history: [] });
      const result = mergeStates(shared, local);
      expect(result.history).toHaveLength(90);
      // oldest entry (index 0, date 2025-01-01) should be trimmed
      expect(result.history[0].date).toBe('2025-01-02');
    });
  });

  describe('settings merge', () => {
    it('uses shared settings when shared lastModified is higher', () => {
      const shared = makeState({ settings: { ...DEFAULT_SETTINGS, lunchBreakMinutes: 30, lastModified: 200 } });
      const local = makeState({ settings: { ...DEFAULT_SETTINGS, lunchBreakMinutes: 60, lastModified: 100 } });
      expect(mergeStates(shared, local).settings.lunchBreakMinutes).toBe(30);
    });

    it('uses local settings when local lastModified is higher', () => {
      const shared = makeState({ settings: { ...DEFAULT_SETTINGS, lunchBreakMinutes: 30, lastModified: 100 } });
      const local = makeState({ settings: { ...DEFAULT_SETTINGS, lunchBreakMinutes: 60, lastModified: 200 } });
      expect(mergeStates(shared, local).settings.lunchBreakMinutes).toBe(60);
    });

    it('treats undefined lastModified as 0', () => {
      // Simulates an old stored state before lastModified was added
      const shared = makeState({ settings: { lunchBreakMinutes: 30, notifyBeforeMinutes: 15 } as any });
      const local = makeState({ settings: { ...DEFAULT_SETTINGS, lunchBreakMinutes: 60, lastModified: 1 } });
      expect(mergeStates(shared, local).settings.lunchBreakMinutes).toBe(60);
    });
  });

  describe('lastActiveTimestamp', () => {
    it('takes the max of both sides', () => {
      const shared = makeState({ lastActiveTimestamp: 500 });
      const local = makeState({ lastActiveTimestamp: 300 });
      expect(mergeStates(shared, local).lastActiveTimestamp).toBe(500);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/utils/merge.test.ts --verbose
```

Expected: FAIL — `Cannot find module '../../src/utils/merge'`

- [ ] **Step 3: Create `src/utils/merge.ts`**

```typescript
import { AppState, CheckInRecord } from './types';
import { MAX_HISTORY_LENGTH } from './storage';

export function mergeStates(shared: AppState | null, local: AppState): AppState {
  if (shared === null) return local;

  const today = mergeToday(shared, local);
  const history = mergeHistory(shared.history, local.history);
  const settings =
    (shared.settings.lastModified ?? 0) >= (local.settings.lastModified ?? 0)
      ? shared.settings
      : local.settings;
  const lastActiveTimestamp = Math.max(shared.lastActiveTimestamp, local.lastActiveTimestamp);

  return { today, history, settings, lastActiveTimestamp };
}

function mergeToday(shared: AppState, local: AppState): AppState['today'] {
  const s = shared.today;
  const l = local.today;
  if (s === null) return l;
  if (l === null) return s;
  if (s.manualOverride && !l.manualOverride) return s;
  if (l.manualOverride && !s.manualOverride) return l;
  return shared.lastActiveTimestamp > local.lastActiveTimestamp ? s : l;
}

function mergeHistory(shared: CheckInRecord[], local: CheckInRecord[]): CheckInRecord[] {
  const byDate = new Map<string, CheckInRecord>();
  for (const r of [...shared, ...local]) {
    const existing = byDate.get(r.date);
    if (!existing) {
      byDate.set(r.date, r);
    } else {
      byDate.set(r.date, mergeHistoryEntry(existing, r));
    }
  }
  const merged = Array.from(byDate.values());
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return merged.slice(-MAX_HISTORY_LENGTH);
}

function mergeHistoryEntry(existing: CheckInRecord, incoming: CheckInRecord): CheckInRecord {
  if (incoming.manualOverride && !existing.manualOverride) return incoming;
  if (!incoming.manualOverride && existing.manualOverride) return existing;
  // both manualOverride true or both false: prefer more recent checkInTime
  return incoming.checkInTime > existing.checkInTime ? incoming : existing;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/utils/merge.test.ts --verbose
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/merge.ts tests/utils/merge.test.ts
git commit -m "feat: add mergeStates() for cross-profile sync conflict resolution"
```

---

### Task 4: Write sync layer

**Files:**
- Create: `src/utils/sync.ts`
- Create: `tests/utils/sync.test.ts`

`chrome.runtime.sendNativeMessage()` uses callbacks, not promises. The sync layer wraps it in a promise and catches all errors silently.

- [ ] **Step 1: Create failing tests**

Create `tests/utils/sync.test.ts`:

```typescript
import { readSharedState, writeSharedState } from '../../src/utils/sync';
import { createDefaultAppState, AppState } from '../../src/utils/types';

const mockSendNativeMessage = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).chrome = {
    runtime: {
      sendNativeMessage: mockSendNativeMessage,
      lastError: undefined,
    },
  };
});

describe('readSharedState', () => {
  it('sends read action to host and returns response', async () => {
    const state = createDefaultAppState();
    mockSendNativeMessage.mockImplementation(
      (_host: string, _msg: unknown, cb: (r: AppState) => void) => cb(state)
    );
    const result = await readSharedState();
    expect(result).toEqual(state);
    expect(mockSendNativeMessage).toHaveBeenCalledWith(
      'com.worktimer.host',
      { action: 'read' },
      expect.any(Function)
    );
  });

  it('returns null when host responds with null', async () => {
    mockSendNativeMessage.mockImplementation(
      (_h: string, _m: unknown, cb: (r: null) => void) => cb(null)
    );
    expect(await readSharedState()).toBeNull();
  });

  it('returns null and warns on chrome.runtime.lastError', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendNativeMessage.mockImplementation(
      (_h: string, _m: unknown, cb: (r: null) => void) => {
        (global as any).chrome.runtime.lastError = { message: 'Host not found' };
        cb(null);
      }
    );
    expect(await readSharedState()).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null when sendNativeMessage throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendNativeMessage.mockImplementation(() => {
      throw new Error('Native messaging not supported');
    });
    expect(await readSharedState()).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('writeSharedState', () => {
  it('sends write action with state to host', async () => {
    const state = createDefaultAppState();
    mockSendNativeMessage.mockImplementation(
      (_h: string, _m: unknown, cb: (r: { ok: boolean }) => void) => cb({ ok: true })
    );
    await writeSharedState(state);
    expect(mockSendNativeMessage).toHaveBeenCalledWith(
      'com.worktimer.host',
      { action: 'write', data: state },
      expect.any(Function)
    );
  });

  it('warns but does not throw on host error response', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendNativeMessage.mockImplementation(
      (_h: string, _m: unknown, cb: (r: { ok: boolean; error: string }) => void) =>
        cb({ ok: false, error: 'disk full' })
    );
    await expect(writeSharedState(createDefaultAppState())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns and resolves on chrome.runtime.lastError in write callback', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendNativeMessage.mockImplementation(
      (_h: string, _m: unknown, cb: (r: null) => void) => {
        (global as any).chrome.runtime.lastError = { message: 'Connection failed' };
        cb(null);
      }
    );
    await expect(writeSharedState(createDefaultAppState())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not throw when sendNativeMessage throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendNativeMessage.mockImplementation(() => {
      throw new Error('not installed');
    });
    await expect(writeSharedState(createDefaultAppState())).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/utils/sync.test.ts --verbose
```

Expected: FAIL — `Cannot find module '../../src/utils/sync'`

- [ ] **Step 3: Create `src/utils/sync.ts`**

```typescript
import { AppState } from './types';

const HOST_NAME = 'com.worktimer.host';

export async function readSharedState(): Promise<AppState | null> {
  try {
    return await new Promise<AppState | null>((resolve) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, { action: 'read' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[sync] readSharedState error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve((response as AppState | null) ?? null);
      });
    });
  } catch (e) {
    console.warn('[sync] readSharedState failed:', e);
    return null;
  }
}

export async function writeSharedState(state: AppState): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendNativeMessage(
        HOST_NAME,
        { action: 'write', data: state },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[sync] writeSharedState error:', chrome.runtime.lastError.message);
          } else if (response && !response.ok) {
            console.warn('[sync] writeSharedState host error:', response.error);
          }
          resolve();
        }
      );
    });
  } catch (e) {
    console.warn('[sync] writeSharedState failed:', e);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/utils/sync.test.ts --verbose
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/sync.ts tests/utils/sync.test.ts
git commit -m "feat: add sync layer wrapping chrome native messaging"
```

---

## Chunk 2: Integration, Native Host, Install Script

### Task 5: Add `nativeMessaging` permission to `manifest.json`

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update `manifest.json`**

Change the `permissions` array from:

```json
"permissions": ["idle", "storage", "alarms", "notifications"]
```

To:

```json
"permissions": ["idle", "storage", "alarms", "notifications", "nativeMessaging"]
```

- [ ] **Step 2: Build to verify no errors**

```bash
npm run build
```

Expected: successful build

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add nativeMessaging permission to manifest"
```

---

### Task 6: Integrate sync into `popup.ts`

**Files:**
- Modify: `src/popup/popup.ts`
- Create: `tests/popup/sync-on-open.test.ts`

We export a `syncOnOpen()` function from `popup.ts` that orchestrates the read → merge → save → write-back sequence. `init()` calls it instead of `getState()` directly.

- [ ] **Step 1: Confirm Jest transform supports mock hoisting**

Check `jest.config.js` — it uses `preset: 'ts-jest'` without `useESM: true`. This is CommonJS mode, which means `jest.mock()` calls are hoisted above `import` statements by Jest's module system. This is a required precondition for the test below. If the config ever adds `useESM: true`, this test file will need to be rewritten using `vi.mock` (Vitest) or `jest.unstable_mockModule`.

- [ ] **Step 2: Create failing tests**

Create `tests/popup/sync-on-open.test.ts`:

```typescript
// jest.mock calls are hoisted — they run before any imports
jest.mock('../../src/utils/sync', () => ({
  readSharedState: jest.fn(),
  writeSharedState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/merge', () => ({
  mergeStates: jest.fn(),
}));

import { readSharedState, writeSharedState } from '../../src/utils/sync';
import { mergeStates } from '../../src/utils/merge';
import { createDefaultAppState, AppState } from '../../src/utils/types';
import { syncOnOpen } from '../../src/popup/popup';

const mockStorage: Record<string, unknown> = {};

beforeAll(() => {
  (global as any).chrome = {
    storage: {
      local: {
        get: jest.fn((keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (mockStorage[k] !== undefined) result[k] = mockStorage[k];
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
});

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  jest.clearAllMocks();
  (writeSharedState as jest.Mock).mockResolvedValue(undefined);
});

describe('syncOnOpen', () => {
  it('reads shared state and merges with local', async () => {
    const local = createDefaultAppState();
    mockStorage['appState'] = local;
    (readSharedState as jest.Mock).mockResolvedValue(null);
    (mergeStates as jest.Mock).mockReturnValue(local);

    await syncOnOpen();

    expect(readSharedState).toHaveBeenCalled();
    expect(mergeStates).toHaveBeenCalledWith(null, local);
  });

  it('persists merged state to chrome.storage.local', async () => {
    const local = createDefaultAppState();
    const merged: AppState = { ...local, lastActiveTimestamp: 999 };
    mockStorage['appState'] = local;
    (readSharedState as jest.Mock).mockResolvedValue(null);
    (mergeStates as jest.Mock).mockReturnValue(merged);

    await syncOnOpen();

    expect(mockStorage['appState']).toEqual(merged);
  });

  it('writes merged state back to native host', async () => {
    const local = createDefaultAppState();
    const merged: AppState = { ...local, lastActiveTimestamp: 999 };
    mockStorage['appState'] = local;
    (readSharedState as jest.Mock).mockResolvedValue(null);
    (mergeStates as jest.Mock).mockReturnValue(merged);

    await syncOnOpen();

    expect(writeSharedState).toHaveBeenCalledWith(merged);
  });

  it('returns the merged state', async () => {
    const local = createDefaultAppState();
    const merged: AppState = { ...local, lastActiveTimestamp: 42 };
    mockStorage['appState'] = local;
    (readSharedState as jest.Mock).mockResolvedValue(null);
    (mergeStates as jest.Mock).mockReturnValue(merged);

    const result = await syncOnOpen();

    expect(result).toEqual(merged);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx jest tests/popup/sync-on-open.test.ts --verbose
```

Expected: FAIL — `syncOnOpen is not exported`

- [ ] **Step 4: Update `src/popup/popup.ts`**

Add these imports at the top of the file (after existing imports):

```typescript
import { readSharedState, writeSharedState } from '../utils/sync';
import { mergeStates } from '../utils/merge';
```

Add the `syncOnOpen` function (place it after existing exported helpers, before the `isInBrowser()` check):

```typescript
export async function syncOnOpen(): Promise<AppState> {
  const shared = await readSharedState();
  const local = await getState();
  const merged = mergeStates(shared, local);
  await setState(merged);
  await writeSharedState(merged);
  return merged;
}
```

Update `init()` to use `syncOnOpen()` instead of `getState()`:

```typescript
async function init(): Promise<void> {
  updateClock();
  startClockInterval();

  const state = await syncOnOpen();
  render(state);
  startCountdown();
  bindEvents();
  checkNotificationPermission();
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest tests/popup/sync-on-open.test.ts --verbose
```

Expected: PASS

- [ ] **Step 6: Run full suite**

```bash
npm test
```

Expected: all pass

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: successful build, no TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/popup/popup.ts tests/popup/sync-on-open.test.ts
git commit -m "feat: integrate cross-profile sync into popup init via syncOnOpen()"
```

---

### Task 7: Write native host

**Files:**
- Create: `native-host/worktimer-host.js`
- Create: `native-host/com.worktimer.host.json`

The native host is a Node.js script. Chrome spawns it on demand via `sendNativeMessage`, passes one message over stdin, and the host writes one response to stdout, then exits. Protocol: each message is prefixed with a 4-byte little-endian uint32 length, followed by UTF-8 JSON.

No automated Jest tests — it requires the file system and native process. Verified manually.

- [ ] **Step 1: Create `native-host/` directory and `worktimer-host.js`**

```bash
mkdir -p native-host
```

Create `native-host/worktimer-host.js`:

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.worktimer');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const TMP_FILE = path.join(DATA_DIR, 'data.json.tmp');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        if (buf.length < 4) return reject(new Error('Message too short'));
        const msgLength = buf.readUInt32LE(0);
        const json = buf.slice(4, 4 + msgLength).toString('utf8');
        resolve(JSON.parse(json));
      } catch (e) {
        reject(e);
      }
    });
    process.stdin.on('error', reject);
  });
}

function writeMessage(msg) {
  const json = JSON.stringify(msg);
  const jsonBuf = Buffer.from(json, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(jsonBuf.length, 0);
  process.stdout.write(Buffer.concat([lenBuf, jsonBuf]));
}

function handleRead() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      writeMessage(null);
      return;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    writeMessage(JSON.parse(raw));
  } catch (e) {
    writeMessage(null);
  }
}

function handleWrite(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), 'utf8');
    fs.renameSync(TMP_FILE, DATA_FILE);
    writeMessage({ ok: true });
  } catch (e) {
    writeMessage({ ok: false, error: String(e) });
  }
}

async function main() {
  try {
    const msg = await readMessage();
    if (msg.action === 'read') {
      handleRead();
    } else if (msg.action === 'write') {
      handleWrite(msg.data);
    } else {
      writeMessage({ ok: false, error: 'unknown action' });
    }
  } catch (e) {
    writeMessage({ ok: false, error: String(e) });
  }
  process.exit(0);
}

main();
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x native-host/worktimer-host.js
```

- [ ] **Step 3: Manually verify read on missing file**

```bash
node -e "
const buf = Buffer.alloc(4);
const msg = JSON.stringify({ action: 'read' });
buf.writeUInt32LE(msg.length, 0);
process.stdout.write(buf);
process.stdout.write(msg);
" | node native-host/worktimer-host.js | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const buf = Buffer.concat(chunks);
  const len = buf.readUInt32LE(0);
  console.log('Response:', buf.slice(4, 4 + len).toString());
});
"
```

Expected output: `Response: null`

- [ ] **Step 4: Manually verify write + read roundtrip**

```bash
# Write a state
node -e "
const buf = Buffer.alloc(4);
const msg = JSON.stringify({ action: 'write', data: { test: true } });
buf.writeUInt32LE(msg.length, 0);
process.stdout.write(buf);
process.stdout.write(msg);
" | node native-host/worktimer-host.js | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const buf = Buffer.concat(chunks);
  const len = buf.readUInt32LE(0);
  console.log('Write response:', buf.slice(4, 4 + len).toString());
});
"

# Read it back
node -e "
const buf = Buffer.alloc(4);
const msg = JSON.stringify({ action: 'read' });
buf.writeUInt32LE(msg.length, 0);
process.stdout.write(buf);
process.stdout.write(msg);
" | node native-host/worktimer-host.js | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const buf = Buffer.concat(chunks);
  const len = buf.readUInt32LE(0);
  console.log('Read response:', buf.slice(4, 4 + len).toString());
});
"
```

Expected: `Write response: {"ok":true}` then `Read response: {"test":true}`

- [ ] **Step 5: Create manifest template `native-host/com.worktimer.host.json`**

```json
{
  "name": "com.worktimer.host",
  "description": "Work Timer sync host",
  "path": "__HOST_PATH__",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://__EXTENSION_ID__/"]
}
```

**Note:** This file is for developer reference only. The `install.sh` script does NOT read this template — it generates the real manifest inline via a heredoc with the correct absolute path and extension ID filled in. Chrome loads the manifest from `~/Library/Application Support/.../NativeMessagingHosts/com.worktimer.host.json`, not from this file.

- [ ] **Step 6: Commit**

```bash
git add native-host/worktimer-host.js native-host/com.worktimer.host.json
git commit -m "feat: add native messaging host for shared state sync"
```

---

### Task 8: Write install script

**Files:**
- Create: `install.sh`

Detects which Chromium browsers are installed (macOS only), prompts for each extension ID, and installs the native host manifest.

- [ ] **Step 1: Create `install.sh`**

```bash
#!/bin/bash
# Note: set -e is intentionally omitted. The `read` builtin returns exit code 1
# on EOF in non-interactive environments, which would cause set -e to abort.
# Instead, critical commands use explicit exit on failure.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native-host/worktimer-host.js"
HOST_NAME="com.worktimer.host"

echo "Work Timer — Native Host Installer"
echo "==================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not found in PATH." >&2
  echo "Install Node.js from https://nodejs.org and try again." >&2
  exit 1
fi
echo "Node.js found: $(node --version)"

# Make host script executable
chmod +x "$HOST_SCRIPT"
echo "Made worktimer-host.js executable"

# Create data directory
mkdir -p "$HOME/.worktimer"
echo "Created ~/.worktimer/"

echo ""
echo "Detecting installed browsers..."

install_for_browser() {
  local BROWSER_NAME="$1"
  local MANIFEST_DIR="$2"
  local PARENT_DIR
  PARENT_DIR="$(dirname "$MANIFEST_DIR")"

  if [ -d "$PARENT_DIR" ]; then
    echo ""
    echo "Found: $BROWSER_NAME"
    read -p "  Enter extension ID for $BROWSER_NAME (or press Enter to skip): " EXT_ID

    if [ -z "$EXT_ID" ]; then
      echo "  Skipping $BROWSER_NAME."
      return
    fi

    mkdir -p "$MANIFEST_DIR"
    cat > "$MANIFEST_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Work Timer sync host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
    echo "  Installed manifest to $MANIFEST_DIR/$HOST_NAME.json"
  fi
}

install_for_browser "Chrome" "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
install_for_browser "Brave"  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
install_for_browser "Edge"   "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
install_for_browser "Arc"    "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"

echo ""
echo "Done! Reload your extensions and reopen the popup to activate sync."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x install.sh
```

- [ ] **Step 3: Verify syntax is valid**

```bash
bash -n install.sh
```

Expected: no output (no errors)

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat: add install.sh for native host setup across Chromium browsers (macOS)"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass, no failures

- [ ] **Step 2: Build extension**

```bash
npm run build
```

Expected: successful build

- [ ] **Step 3: Manual end-to-end check (optional but recommended)**

1. Load the extension from `dist/` in Chrome (`chrome://extensions/` → Load unpacked)
2. Note the extension ID
3. Run `./install.sh`, enter the extension ID when prompted for Chrome
4. Reload the extension
5. Open the popup — check-in data should sync; open popup in another Chrome profile to verify shared state

- [ ] **Step 4: Final commit if anything uncommitted**

```bash
git status
```

If there are uncommitted changes:

```bash
git add -A
git commit -m "chore: cleanup after cross-profile sync implementation"
```
