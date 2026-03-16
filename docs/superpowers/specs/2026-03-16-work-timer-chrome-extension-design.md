# Work Timer Chrome Extension - Design Spec

## Overview

Chrome extension that automatically tracks work hours by detecting when the user starts their workday (opens/unlocks their computer), subtracts a configurable lunch break, and calculates the earliest checkout time for an 8-hour work day. Provides notifications before checkout time and allows exporting history.

## Architecture

### Stack
- **Chrome Extension Manifest V3**
- **TypeScript** with Webpack + ts-loader for bundling
- **chrome.storage.local** for persistence
- **chrome.idle API** for detecting user activity state
- **chrome.alarms API** for scheduling notifications (required because MV3 service workers are short-lived)
- **chrome.notifications API** for checkout reminders

### File Structure

```
reminder/
├── manifest.json
├── tsconfig.json
├── package.json
├── webpack.config.js
├── src/
│   ├── background.ts
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.ts
│   └── utils/
│       ├── storage.ts
│       └── types.ts
└── dist/                     # Build output (Chrome loads from here)
```

### Permissions

- `idle` — detect active/idle/locked state
- `storage` — persist data locally
- `alarms` — schedule notification triggers
- `notifications` — display checkout reminders

## Data Model

```typescript
interface CheckInRecord {
  date: string;                  // "2026-03-16"
  checkInTime: number;           // timestamp (ms)
  expectedCheckoutTime: number;   // calculated checkout timestamp
  manualOverride: boolean;       // true if user manually edited check-in time
}

interface Settings {
  lunchBreakMinutes: number;     // default: 60
  notifyBeforeMinutes: number;   // default: 15
}

interface AppState {
  today: CheckInRecord | null;
  history: CheckInRecord[];      // previous days' records, max 90 days
  settings: Settings;
  lastActiveTimestamp: number;   // last time user was detected as active
}
```

### Checkout Calculation

```
expectedCheckoutTime = checkInTime + (8 * 60 + lunchBreakMinutes) * 60 * 1000
```

Check-in time + 8 hours of work + lunch break duration = checkout time.

## Background Service Worker

### Idle Detection & Auto Check-in

1. Set `chrome.idle.setDetectionInterval(300)` (5 minutes)
2. Listen to `chrome.idle.onStateChanged`
3. When state transitions to `"active"`:
   - Read `AppState` from storage
   - Calculate `timeSinceLastActive = Date.now() - lastActiveTimestamp`
   - Update `lastActiveTimestamp = Date.now()`

**Check-in triggers:**
- If current date differs from `today.date` → always create new check-in (handles short overnight gaps)
- If `timeSinceLastActive > 4 hours` AND date differs → also creates new check-in (redundant but explicit)
- `"idle"` and `"locked"` states from `onStateChanged` are intentionally ignored — only `"active"` triggers logic

**When creating a new check-in:**
1. If `today` exists for a previous date → move it to `history` array, trim history to 90 entries
2. Create new `CheckInRecord` with `checkInTime = Date.now()`
3. Calculate `expectedCheckoutTime`
4. Create alarm: `chrome.alarms.create("checkout-reminder", { when: expectedCheckoutTime - notifyBeforeMinutes * 60000 })`
5. Save to storage

**First-time install / no existing data:**
- When `today` is `null` and state becomes `"active"` → create check-in immediately

### Service Worker Lifecycle

MV3 service workers are ephemeral — they can be terminated at any time and restarted on events. All state MUST be persisted in `chrome.storage.local`, never held in memory variables across events.

**On every service worker start:**
1. Call `chrome.idle.setDetectionInterval(300)` — must re-register on every start, not just on install
2. Verify alarm exists via `chrome.alarms.get("checkout-reminder")` — if today has a check-in but alarm is missing, recreate it
3. All event listeners (`chrome.idle.onStateChanged`, `chrome.alarms.onAlarm`) are registered at top-level scope

**Why `chrome.alarms` works:** Alarms survive service worker restarts — Chrome manages them independently. This is why we use alarms instead of `setTimeout`.

### Alarm & Notification

- Listen to `chrome.alarms.onAlarm`
- When `"checkout-reminder"` fires → `chrome.notifications.create(...)` with message: "Con X phut nua la du gio lam viec!"
- Check `chrome.notifications.getPermissionLevel()` before attempting to notify

### Notification Permission

- On extension install (`chrome.runtime.onInstalled`) → check notification permission level
- Store permission status in `AppState` or separate storage key
- If OS-level notifications are blocked → flag for popup to display warning

## Popup UI

### Layout

**Header:**
- Display current date (e.g., "16/03/2026")

**Main Info Panel:**
- Check-in time: `08:26` with edit button (pencil icon)
- Lunch break: `60 phut`
- Expected checkout: `17:26` (auto-calculated)
- Time remaining: `3h 25m` (live countdown, updates every second via `setInterval`)
- Progress bar showing % of work day completed

**Footer Actions:**
- "Export History" button → download JSON or CSV file
- "Settings" button → toggle settings panel
- Notification status: green icon if enabled, red icon + "Bat thong bao" button if disabled

### Settings Panel (toggle show/hide)

- Input: Lunch break duration (minutes), default 60
- Input: Notify before checkout (minutes), default 15
- Save button → update `Settings` in storage, recalculate checkout time, reset alarm

### Manual Check-in Edit

- Click edit button next to check-in time → show time picker input
- On save:
  - Update `checkInTime` in `CheckInRecord`
  - Set `manualOverride = true`
  - Recalculate `expectedCheckoutTime`
  - Clear and recreate alarm with new timing
  - Update UI

### Export History

- Read `history` array from storage
- Generate downloadable file:
  - **JSON**: direct serialization of `CheckInRecord[]`
  - **CSV**: columns: `date, checkInTime, expectedCheckoutTime, manualOverride` — timestamps formatted as `HH:mm` local time
- Trigger browser download via `Blob` + `URL.createObjectURL`

## Edge Cases

1. **User doesn't close Chrome/computer overnight**: Detected via `timeSinceLastActive > 4h` + new date → creates new check-in
2. **Multiple unlocks in same day**: Only first unlock creates check-in; subsequent unlocks update `lastActiveTimestamp` only
3. **Manual override then auto-detect**: If `manualOverride = true`, do not overwrite with auto-detected time for the same day
4. **Extension installed mid-day**: First `"active"` state creates check-in immediately
5. **Settings changed after check-in**: Recalculate checkout time and reset alarm
6. **Notification blocked at OS level**: Show warning in popup UI with instructions to enable
7. **After checkout time passes**: Countdown shows `0h 0m`, progress bar stays at 100%
8. **Timezone**: All dates and times use the local timezone of the machine
9. **History cleanup**: When archiving a day, trim `history` to max 90 entries (oldest removed first)
