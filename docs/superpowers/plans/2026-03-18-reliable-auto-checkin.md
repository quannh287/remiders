# Reliable Auto Check-in Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auto check-in reliable by adding `chrome.runtime.onStartup` signal with work-hour guard (6:00-11:00), extracting shared `tryAutoCheckIn()` logic used by both `onStartup` and idle detection.

**Architecture:** Extract a pure `isWithinWorkHours()` guard and a `tryAutoCheckIn()` function from the existing `handleActiveState()`. Both `onStartup` and `idle.onStateChanged` call `tryAutoCheckIn()`. The work-hour constants live in `types.ts` alongside other defaults.

**Tech Stack:** TypeScript, Chrome Extension APIs (runtime.onStartup, idle, alarms)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/types.ts` | Modify | Add `AUTO_CHECKIN_HOUR_START`, `AUTO_CHECKIN_HOUR_END` constants |
| `src/background.ts` | Modify | Extract `isWithinWorkHours()`, refactor `handleActiveState()` → `tryAutoCheckIn()`, add `onStartup` listener |
| `tests/background.test.ts` | Modify | Add tests for `isWithinWorkHours()` and `tryAutoCheckIn()` with hour guards |

---

## Chunk 1: Implementation

### Task 1: Add work-hour constants

**Files:**
- Modify: `src/utils/types.ts`

- [ ] **Step 1: Add constants to types.ts**

Add after `DEFAULT_SETTINGS`:

```typescript
export const AUTO_CHECKIN_HOUR_START = 6;
export const AUTO_CHECKIN_HOUR_END = 11;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiled successfully

- [ ] **Step 3: Commit**

```bash
git add src/utils/types.ts
git commit -m "feat: add auto check-in work hour constants"
```

---

### Task 2: Add `isWithinWorkHours` with TDD

**Files:**
- Modify: `tests/background.test.ts`
- Modify: `src/background.ts`

- [ ] **Step 1: Write failing tests for `isWithinWorkHours`**

Add to `tests/background.test.ts`, new import and describe block:

```typescript
// Update import line at top:
import { handleActiveState, isWithinWorkHours } from '../src/background';

// Add new describe block at the end:
describe('isWithinWorkHours', () => {
  it('returns true at 6:00', () => {
    jest.setSystemTime(new Date('2026-03-18T06:00:00'));
    expect(isWithinWorkHours()).toBe(true);
  });

  it('returns true at 10:59', () => {
    jest.setSystemTime(new Date('2026-03-18T10:59:00'));
    expect(isWithinWorkHours()).toBe(true);
  });

  it('returns false at 11:00', () => {
    jest.setSystemTime(new Date('2026-03-18T11:00:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns false at 5:59', () => {
    jest.setSystemTime(new Date('2026-03-18T05:59:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns false at 2:00 (late night)', () => {
    jest.setSystemTime(new Date('2026-03-18T02:00:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns true at 8:30 (typical morning)', () => {
    jest.setSystemTime(new Date('2026-03-18T08:30:00'));
    expect(isWithinWorkHours()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/background.test.ts --verbose`
Expected: FAIL — `isWithinWorkHours` is not exported

- [ ] **Step 3: Write implementation**

Add to `src/background.ts` after the imports:

```typescript
import { createCheckInRecord, todayDateString, AUTO_CHECKIN_HOUR_START, AUTO_CHECKIN_HOUR_END } from './utils/types';

export function isWithinWorkHours(): boolean {
  const hour = new Date().getHours();
  return hour >= AUTO_CHECKIN_HOUR_START && hour < AUTO_CHECKIN_HOUR_END;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/background.test.ts --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/background.ts tests/background.test.ts
git commit -m "feat: add isWithinWorkHours guard with tests"
```

---

### Task 3: Refactor `handleActiveState` to use `tryAutoCheckIn` with work-hour guard

**Files:**
- Modify: `src/background.ts`
- Modify: `tests/background.test.ts`

- [ ] **Step 1: Write failing tests for work-hour guard on auto check-in**

Add to the existing `handleActiveState` describe block in `tests/background.test.ts`:

```typescript
  it('does not auto check-in outside work hours (before 6:00)', async () => {
    jest.setSystemTime(new Date('2026-03-18T05:30:00'));
    await handleActiveState();
    expect(mockState.today).toBeNull();
  });

  it('does not auto check-in outside work hours (after 11:00)', async () => {
    jest.setSystemTime(new Date('2026-03-18T14:00:00'));
    await handleActiveState();
    expect(mockState.today).toBeNull();
  });

  it('still updates lastActiveTimestamp outside work hours when record exists', async () => {
    jest.setSystemTime(new Date('2026-03-18T14:00:00'));
    mockState.today = {
      date: '2026-03-18',
      checkInTime: new Date('2026-03-18T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-18T17:00:00').getTime(),
      manualOverride: false,
    };
    await handleActiveState();
    expect(mockState.lastActiveTimestamp).toBe(new Date('2026-03-18T14:00:00').getTime());
  });
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx jest tests/background.test.ts --verbose`
Expected: "does not auto check-in outside work hours" tests FAIL (current code has no hour guard)

- [ ] **Step 3: Refactor `handleActiveState` to add work-hour guard**

Replace `handleActiveState` in `src/background.ts` with:

```typescript
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
```

- [ ] **Step 4: Update existing tests that now need work-hour context**

Some existing tests set times like `08:00`, `08:26`, `08:30` which are within work hours — these should still pass. The `trims history to 90 entries` test uses `2026-06-16T08:00:00` which is also within hours — still passes. Verify all pass.

Run: `npx jest tests/background.test.ts --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/background.ts tests/background.test.ts
git commit -m "feat: add work-hour guard to auto check-in"
```

---

### Task 4: Add `chrome.runtime.onStartup` listener

**Files:**
- Modify: `src/background.ts`
- Modify: `tests/background.test.ts`

- [ ] **Step 1: Add `onStartup` mock to test setup**

In `tests/background.test.ts`, add to the chrome mock object (inside `(global as any).chrome`):

```typescript
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
  },
```

- [ ] **Step 2: Add `onStartup` listener in background.ts**

Add after the `chrome.idle.onStateChanged.addListener` block:

```typescript
chrome.runtime.onStartup.addListener(async () => {
  await handleActiveState();
});
```

- [ ] **Step 3: Run full test suite and build**

Run: `npm test && npm run build`
Expected: All tests pass, build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/background.ts tests/background.test.ts
git commit -m "feat: add onStartup listener for reliable auto check-in"
```
