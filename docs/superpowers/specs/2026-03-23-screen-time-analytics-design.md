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

### Raw Session (kept 7 days)

```ts
interface ScreenSession {
  start: number;        // timestamp unlock/active
  end: number | null;   // timestamp lock/idle, null = currently active
  type: 'active' | 'locked' | 'idle';
}
```

### Hourly Aggregate (kept 90 days)

```ts
interface HourlySlot {
  date: string;         // "2026-03-23"
  hour: number;         // 0-23
  activeMinutes: number; // 0-60
}
```

### Screen Time State (storage key: `screenTimeState`)

```ts
interface ScreenTimeState {
  sessions: ScreenSession[];
  hourlySlots: HourlySlot[];
  currentSession: ScreenSession | null;
  settings: {
    idleThresholdMinutes: number; // default 5, user configurable 1-30
  };
}
```

## Architecture

### New Files

```
src/screen-time/
  tracker.ts      # Core tracking logic
  storage.ts      # Read/write screenTimeState
  popup-summary.ts # Render today's summary in popup
  dashboard.html   # Analytics page markup
  dashboard.ts     # Analytics page logic (Chart.js + chartjs-chart-matrix)
  dashboard.css    # Analytics page styles
```

### Session Tracking (`src/screen-time/tracker.ts`)

- `initScreenTimeTracker()` — set `chrome.idle.setDetectionInterval()` from settings
- `onIdleStateChanged(state)` — main handler:
  - `active` → create new `currentSession`
  - `idle` / `locked` → close `currentSession`, aggregate into hourly slots, push to `sessions[]`
- `aggregateToHourlySlots(session)` — split session across hour boundaries (e.g., 9:30-11:15 → 30min in slot 9, 60min in slot 10, 15min in slot 11)
- `recoverSession(lastActiveTimestamp)` — handle service worker restart, close orphaned session
- `trimOldData()` — remove sessions > 7 days, hourly slots > 90 days

### Integration with `background.ts`

```ts
import { onIdleStateChanged, initScreenTimeTracker } from './screen-time/tracker';

initScreenTimeTracker();
chrome.idle.onStateChanged.addListener(onIdleStateChanged);
```

Background.ts only imports and wires up. All screen time logic stays in `src/screen-time/`.

### Edge Cases

- **Session spans multiple hours:** `aggregateToHourlySlots()` splits at hour boundaries
- **Service worker killed/restarted:** `recoverSession()` uses `lastActiveTimestamp` from `AppState` to close orphaned `currentSession`
- **Only tracks during work hours:** Respects existing check-in state

### Storage (`src/screen-time/storage.ts`)

Separate from existing `src/utils/storage.ts`. Uses its own storage key `screenTimeState` in `chrome.storage.local`.

- `getScreenTimeState(): Promise<ScreenTimeState>`
- `setScreenTimeState(state: ScreenTimeState): Promise<void>`
- `updateScreenTimeSettings(settings): Promise<void>`

## UI

### Popup Summary (`src/screen-time/popup-summary.ts`)

Added below existing progress card in popup:

- **On screen:** X hours Y minutes (total active today)
- **Off screen:** X hours Y minutes (total locked/idle today)
- **Mini timeline bar:** horizontal bar representing today, green = active, gray = off
- **"View details" link** → opens dashboard in new tab via `chrome.tabs.create()`

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

### Settings

Added to existing settings panel in popup:

- **Idle threshold:** input 1-30 minutes, default 5
- Label: "Consider away after X minutes of inactivity"
- On change → save to `screenTimeState.settings`, call `chrome.idle.setDetectionInterval()`

## Permissions

No new permissions needed. `idle`, `storage`, and `tabs` are already in manifest.

## Dependencies

- `chart.js` (~60KB gzipped) — charting library
- `chartjs-chart-matrix` — heatmap plugin for Chart.js

## Webpack

Add new entry point for dashboard:

```js
entry: {
  background: './src/background.ts',
  popup: './src/popup/popup.ts',
  dashboard: './src/screen-time/dashboard.ts',  // new
}
```

Copy `dashboard.html` to dist via `CopyWebpackPlugin` or `HtmlWebpackPlugin`.

## Testing

All tests in `tests/screen-time/`:

- **`tracker.test.ts`** — session start/end, multi-hour aggregation, service worker recovery, data trimming
- **`storage.test.ts`** — get/set state, update settings, default state
- **`dashboard.test.ts`** — summary stats calculation, date range filtering, heatmap data transformation

Mock `chrome.storage.local` and `chrome.idle` following existing test patterns. Focus on logic, not UI rendering.

## Data Size Estimate

- Raw sessions (7 days): ~50 sessions/day × 7 = 350 entries, ~15KB
- Hourly slots (90 days): 24 slots/day × 90 = 2,160 entries, ~50KB
- Total: ~65KB — well within `chrome.storage.local` 10MB limit
