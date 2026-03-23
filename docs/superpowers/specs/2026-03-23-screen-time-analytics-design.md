# Screen Time Analytics Design

## Overview

Add screen time tracking and analytics to the Work Timer extension. Track when the user is actively using their computer (screen unlocked/active) vs away (screen locked/idle), then visualize usage patterns via a heatmap dashboard.

## Goals

- Track on-screen vs off-screen time based on lock/idle state
- Show today's summary in the popup
- Provide a detailed heatmap dashboard (GitHub contribution graph style) in a new tab
- Keep raw session data for 7 days, hourly aggregates for 90 days
- User-configurable idle threshold

## Data Model

### Types (`src/screen-time/types.ts`)

### Raw Session (kept 7 days)

```ts
interface ScreenSession {
  start: number;        // timestamp unlock/active
  end: number | null;   // timestamp lock/idle, null = currently active
  type: 'active' | 'locked' | 'idle';
}
```

### Hourly Aggregate (kept 90 days)

Stored as a `Record` keyed by `"YYYY-MM-DD-HH"` for O(1) lookup/update:

```ts
type HourlySlotMap = Record<string, number>; // key: "2026-03-23-14", value: activeMinutes (0-60)
```

### Screen Time State (storage key: `screenTimeState`)

```ts
interface ScreenTimeState {
  sessions: ScreenSession[];
  hourlySlots: HourlySlotMap;
  currentSession: ScreenSession | null;
  settings: {
    idleThresholdMinutes: number; // default 5, user configurable 1-30
  };
  schemaVersion: number; // 1, for future migrations
}
```

## Architecture

### New Files

```
src/screen-time/
  types.ts        # ScreenSession, HourlySlotMap, ScreenTimeState interfaces
  tracker.ts      # Core tracking logic
  storage.ts      # Read/write screenTimeState
  popup-summary.ts # Render today's summary in popup
  dashboard.html   # Analytics page markup
  dashboard.ts     # Analytics page logic (Chart.js + chartjs-chart-matrix)
  dashboard.css    # Analytics page styles
```

### Session Tracking (`src/screen-time/tracker.ts`)

- `initScreenTimeTracker()` — reads screen time settings, computes unified idle interval (see Idle Detection Unification below), calls `chrome.idle.setDetectionInterval()`, and calls `recoverSession()` on startup
- `handleScreenTimeStateChange(state)` — screen time handler called by the unified dispatcher:
  - Only tracks when user has checked in (`appState.today !== null`). If not checked in, ignores the event.
  - `active` → create new `currentSession`
  - `idle` / `locked` → close `currentSession`, aggregate into hourly slots, push to `sessions[]`
- `aggregateToHourlySlots(session)` — split session across hour boundaries (e.g., 9:30-11:15 → 30min in slot 14, 60min in slot 10, 15min in slot 11). Updates `HourlySlotMap` entries, capping each at 60.
- `recoverSession()` — called on service worker startup:
  1. Read `screenTimeState.currentSession` from storage
  2. If `currentSession !== null` (orphaned session from killed service worker):
     - Use `appState.lastActiveTimestamp` as the session end time
     - If `lastActiveTimestamp` is from a different day than session start, discard the session (stale data)
     - Otherwise, close the session, aggregate to hourly slots, push to sessions
  3. Set `currentSession = null`
- `trimOldData()` — remove sessions > 7 days, hourly slot keys with dates > 90 days

### Idle Detection Unification

The existing `background.ts` sets `chrome.idle.setDetectionInterval(300)` (5 min) for work timer auto-check-in. Screen time tracking needs its own configurable threshold. Since there is only one global idle detection interval:

**Strategy:** Use a single unified dispatcher in `background.ts`. The detection interval is set to the **minimum** of the work timer threshold (5 min) and the screen time threshold (user-configured). Each handler independently decides whether to act:

```ts
// background.ts — unified idle state dispatcher
import { handleScreenTimeStateChange, getScreenTimeIdleThreshold } from './screen-time/tracker';

const WORK_TIMER_IDLE_SECONDS = 300; // 5 minutes

function initIdleDetection() {
  const screenTimeSeconds = getScreenTimeIdleThreshold() * 60;
  const interval = Math.min(WORK_TIMER_IDLE_SECONDS, screenTimeSeconds);
  chrome.idle.setDetectionInterval(interval);
}

chrome.idle.onStateChanged.addListener((state) => {
  // Work timer handler (existing logic, only cares about 'active')
  handleActiveState(state);
  // Screen time handler (cares about all states)
  handleScreenTimeStateChange(state);
});
```

This replaces the existing separate listener registration. One listener, two handlers.

### When Screen Time Tracking is Active

Screen time is tracked **only when the user has checked in** for the day (`appState.today !== null`). This means:
- Before check-in: no tracking
- After checkout time: still tracking (user may work overtime)
- Weekends: only if user manually checks in
- If user forgets to check in: no tracking (consistent with existing work timer behavior)

### Edge Cases

- **Session spans multiple hours:** `aggregateToHourlySlots()` splits at hour boundaries
- **Service worker killed/restarted:** `recoverSession()` runs on startup, closes orphaned session using `lastActiveTimestamp`. If timestamp is from a different day, session is discarded.
- **Stale `lastActiveTimestamp`:** If from a different day than session start, discard the orphaned session rather than creating incorrect data.
- **Idle threshold changed:** When user updates idle threshold in settings, call `initIdleDetection()` to recalculate and apply the unified interval.

### Storage (`src/screen-time/storage.ts`)

Separate from existing `src/utils/storage.ts`. Uses its own storage key `screenTimeState` in `chrome.storage.local`.

- `getScreenTimeState(): Promise<ScreenTimeState>` — returns default state if key doesn't exist (handles fresh install / update)
- `setScreenTimeState(state: ScreenTimeState): Promise<void>`
- `updateScreenTimeSettings(settings): Promise<void>`
- `getDefaultScreenTimeState(): ScreenTimeState` — returns initial state with `schemaVersion: 1`

### Data Cleanup

`trimOldData()` runs in two places:
1. **On every session close** — lightweight, just filters arrays/keys
2. **Daily via `chrome.alarms`** — register a `screenTimeTrim` alarm that fires once per day as a safety net (handles case where user doesn't lock/unlock for extended periods)

## UI

### Popup Summary (`src/screen-time/popup-summary.ts`)

Added below existing progress card in popup:

- **On screen:** X hours Y minutes (total active today)
- **Off screen:** X hours Y minutes (total locked/idle today)
- **Mini timeline bar:** 300px wide, 12px tall horizontal bar. Divided into slots from check-in time to now. Green (#4CAF50) = active, gray (#E0E0E0) = off. Resolution: 5-minute blocks. Current moment shown with a subtle pulse indicator.
- **"View details" link** → opens dashboard in new tab via `chrome.tabs.create({ url: chrome.runtime.getURL('screen-time/dashboard.html') })`

Imported and called from `src/popup/popup.ts`.

### Dashboard Page (`src/screen-time/dashboard.*`)

Opened via `chrome.tabs.create()`. New webpack entry point.

**Layout:**

1. **Header** — "Screen Time Analytics" + date range selector (7d / 30d / 90d)
2. **Summary cards** — average on-screen/day, peak hour, today vs average
3. **Heatmap** — Chart.js + chartjs-chart-matrix plugin
   - X axis: days (columns), Y axis: hours 0-23 (rows)
   - Color scale: white (0 min) → dark green (60 min)
   - Hover tooltip: "23/03, 14h: 45 min active"
   - Horizontal scroll for many days
4. **Daily breakdown** — click a day on heatmap → show timeline bar detail (uses raw sessions if within 7 days)

**Important:** Chart.js is only imported in `dashboard.ts`. It must NOT be pulled into the popup or background bundles.

### Settings

Added to existing settings panel in popup:

- **Idle threshold:** input 1-30 minutes, default 5
- Label: "Consider away after X minutes of inactivity"
- On change → save to `screenTimeState.settings`, call `initIdleDetection()` to recalculate unified interval

## Permissions

No new permissions needed. Current manifest has: `idle`, `storage`, `alarms`, `notifications`. Opening an extension page via `chrome.tabs.create({ url: chrome.runtime.getURL(...) })` does not require the `tabs` permission in Manifest V3.

## Dependencies

- `chart.js` (~60KB gzipped) — charting library
- `chartjs-chart-matrix` — heatmap plugin for Chart.js

## Webpack

Add new entry point for dashboard:

```js
entry: {
  background: './src/background.ts',
  'popup/popup': './src/popup/popup.ts',
  'screen-time/dashboard': './src/screen-time/dashboard.ts',  // new — outputs to dist/screen-time/dashboard.js
}
```

Use `CopyWebpackPlugin` to copy `src/screen-time/dashboard.html` and `src/screen-time/dashboard.css` to `dist/screen-time/`.

## Testing

All tests in `tests/screen-time/`:

- **`tracker.test.ts`** — session start/end, multi-hour aggregation, service worker recovery (including stale timestamp), data trimming, unified idle interval calculation, check-in guard
- **`storage.test.ts`** — get/set state, update settings, default state on fresh install, schema version
- **`dashboard.test.ts`** — summary stats calculation, date range filtering, heatmap data transformation

Mock `chrome.storage.local` and `chrome.idle` following existing test patterns. Focus on logic, not UI rendering.

## Data Size Estimate

- Raw sessions (7 days): ~50 sessions/day × 7 = 350 entries, ~15KB
- Hourly slots (90 days): 24 slots/day × 90 = 2,160 entries, ~50KB
- Total: ~65KB — well within `chrome.storage.local` 10MB limit
