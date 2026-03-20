# Cross-Profile Sync via Native Messaging — Design Spec

## Overview

Add data synchronization across multiple Chrome profiles and Chromium-based browsers (Chrome, Brave, Edge, Arc, etc.) on the same machine. Uses Chrome's Native Messaging mechanism to communicate with a shared native host process that reads/writes a single JSON file on disk. No persistent background service required — the native host is spawned on demand by Chrome and killed when done.

**Platform:** macOS only. Linux and Windows use different `NativeMessagingHosts` paths and are out of scope.

## Goals

- Sync `AppState` (today's check-in, history, settings) across all Chromium-based browsers on the same machine
- No Google account dependency — works across different accounts and browser vendors
- Graceful fallback if native host is not installed — extension continues working as before
- On-demand sync: sync when popup opens and on write events (check-in, settings change)

## Architecture

```
Chrome Profile A                    Chrome Profile B / Brave / Edge / Arc
┌─────────────────┐                ┌─────────────────┐
│  popup.ts       │                │  popup.ts       │
│  storage.local  │                │  storage.local  │
└────────┬────────┘                └────────┬────────┘
         │ chrome.runtime                   │ chrome.runtime
         │ .sendNativeMessage()             │ .sendNativeMessage()
         ▼                                  ▼
┌─────────────────────────────────────────────────────┐
│           Native Host (worktimer-host.js)           │
│           Node.js script, spawned on demand         │
└────────────────────────┬────────────────────────────┘
                         │ read/write (atomic)
                         ▼
              ~/.worktimer/data.json
              (source of truth, shared across all profiles)
```

**Two-layer storage:**
- `chrome.storage.local` — fast cache for the current profile (UI never waits on disk I/O)
- `~/.worktimer/data.json` — shared source of truth across all profiles and browsers

**Why sync is popup-only (not background):** In MV3, the background context is a Service Worker. `chrome.runtime.sendNativeMessage()` is not available in Service Workers — it is only callable from extension pages (popup, options page). Therefore all native messaging calls originate from `popup.ts`. The background service worker continues to use `chrome.storage.local` exclusively. When the popup opens, it reads from the shared file, merges with local state, and persists the result to `chrome.storage.local` so the background has the latest data.

## Components

### 1. Native Host (`native-host/worktimer-host.js`)

Node.js script implementing the Chrome Native Messaging stdio protocol (4-byte little-endian length prefix + JSON payload).

Supported operations:

```typescript
// Read shared state
{ action: "read" }
// Response: AppState | null

// Write shared state
{ action: "write", data: AppState }
// Response: { ok: true } | { ok: false, error: string }
```

Writes are atomic: write to `~/.worktimer/data.json.tmp` then rename to `~/.worktimer/data.json` to prevent file corruption on concurrent writes. The atomic rename does not prevent a lost-update race if two popups open simultaneously across profiles — this is an accepted trade-off. Last-rename-wins is acceptable for a single-user tool.

If `~/.worktimer/data.json` does not exist, returns `null`. The extension initializes a fresh state in that case.

### 2. Native Host Manifest (`native-host/com.worktimer.host.json`)

```json
{
  "name": "com.worktimer.host",
  "description": "Work Timer sync host",
  "path": "/absolute/path/to/native-host/worktimer-host.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

Each browser requires its own copy of this manifest in its `NativeMessagingHosts` directory, with the correct `allowed_origins` for that browser's extension ID.

### 3. Install Script (`install.sh`)

One-time setup script run after loading the extension. Responsibilities:

- Check that Node.js is available in PATH; exit with a clear error if not
- Detect which Chromium browsers are installed on the machine (macOS paths):
  - Chrome: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
  - Brave: `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
  - Edge: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`
  - Arc: `~/Library/Application Support/Arc/User Data/NativeMessagingHosts/`
- For each detected browser, prompt user to enter the extension ID, then generate a manifest with:
  - `allowed_origins` set to `["chrome-extension://<entered-extension-id>/"]`
  - `path` set to the absolute path of `worktimer-host.js` resolved at install time (e.g. `$(pwd)/native-host/worktimer-host.js`)
  - Copy the generated manifest to the browser's `NativeMessagingHosts/` directory
- Create `~/.worktimer/` directory if it does not exist
- Make `worktimer-host.js` executable (`chmod +x`)

### 4. Sync Layer (`src/utils/sync.ts`)

Wrapper around `chrome.runtime.sendNativeMessage()`. Called only from `popup.ts`.

```typescript
const HOST_NAME = "com.worktimer.host";

async function readSharedState(): Promise<AppState | null>
async function writeSharedState(state: AppState): Promise<void>
```

If the native host is not available (not installed, Node.js missing, any runtime error) → log a warning and return `null` / silently skip write. Extension falls back to `chrome.storage.local` behavior as before — no crash, no user-visible error.

### 5. Integration Points

**`popup.ts` only** — on popup open, before rendering:
```typescript
const shared = await readSharedState();       // from ~/.worktimer/data.json
const local = await getStoredState();          // from chrome.storage.local
const merged = mergeStates(shared, local);
await saveState(merged);                       // persist to chrome.storage.local
await writeSharedState(merged);               // write merged state back to shared file
// render from merged
```

**`background.ts`** — no changes. Continues using `chrome.storage.local` exclusively. When the user's popup opens after a background check-in, the popup merge step picks up the new check-in from local storage and propagates it to the shared file.

### 6. Manifest Permission

Add `"nativeMessaging"` to the `permissions` array in `manifest.json`:

```json
"permissions": ["idle", "storage", "alarms", "notifications", "nativeMessaging"]
```

Without this permission, all `chrome.runtime.sendNativeMessage()` calls will fail silently.

## Merge Logic

Last-write-wins based on timestamps. Applied in `popup.ts` when comparing shared state from file vs local `chrome.storage.local` state.

### Today's check-in

Use `lastActiveTimestamp` on `AppState` as the tie-breaker for the overall state freshness. For today's check-in specifically:

```
if shared.today is null → use local
if local.today is null → use shared
if manualOverride is true on shared.today, false on local.today → use shared
if manualOverride is true on local.today, false on shared.today → use local
if shared.lastActiveTimestamp > local.lastActiveTimestamp → use shared.today
else → use local.today
```

`lastActiveTimestamp` is already maintained by the background service worker on every idle→active event, making it a reliable proxy for "which profile was most recently active". A separate `today.lastModified` field is not needed.

### History

Merge as union keyed by `date`. For duplicate dates, prefer the record with `manualOverride = true`; if both have `manualOverride = true`, prefer the one with the more recent `checkInTime`. After merge, sort ascending by date (oldest first, consistent with existing `trimHistory()` which uses `slice(-MAX_HISTORY_LENGTH)`), then trim to the last 90 entries to keep the most recent records.

### Settings

Compare `Settings.lastModified` timestamp. Use whichever is newer. If either side has `lastModified` missing or `undefined`, treat it as `0` (epoch) — that side loses the comparison.

## Data Model Changes

Add `lastModified` to `Settings`:

```typescript
interface Settings {
  lunchBreakMinutes: number;
  notifyBeforeMinutes: number;
  lastModified: number;  // timestamp ms, set on every settings save; default 0
}
```

Update `DEFAULT_SETTINGS`:

```typescript
const DEFAULT_SETTINGS: Settings = {
  lunchBreakMinutes: 60,
  notifyBeforeMinutes: 15,
  lastModified: 0,
};
```

Update `updateSettings()` in `storage.ts` to stamp `Date.now()` into `lastModified` on every call:

```typescript
async function updateSettings(partial: Partial<Omit<Settings, 'lastModified'>>): Promise<void> {
  const state = await getStoredState();
  state.settings = { ...state.settings, ...partial, lastModified: Date.now() };
  await saveState(state);
}
```

Existing stored states read from `chrome.storage.local` or `~/.worktimer/data.json` that predate this change will have `lastModified` as `undefined`. Treat `undefined` as `0` in all merge comparisons — no migration needed.

## Edge Cases

| Scenario | Handling |
|---|---|
| Native host not installed | `sync.ts` catches the error, returns `null`, extension uses `chrome.storage.local` only |
| `~/.worktimer/data.json` missing | Native host returns `null`; extension treats as first-run for sync |
| Corrupt / invalid JSON in file | Native host returns error; `sync.ts` logs warning, falls back to local state |
| Two popups open simultaneously | Atomic rename prevents file corruption; last write wins (accepted trade-off) |
| Different extension IDs across browsers | Each browser gets its own manifest with its own `allowed_origins`; same host binary |
| Node.js not in PATH | Install script checks and exits with clear error message before registering anything |
| `lastModified` undefined (old stored state) | Treat as `0`; other side wins settings comparison |
| Firefox | Not supported — Firefox extensions are separate packages. Out of scope. |

## File Structure Changes

```
reminder/
├── native-host/
│   ├── worktimer-host.js          # Native messaging host (Node.js)
│   └── com.worktimer.host.json    # Manifest template
├── install.sh                     # One-time install script (macOS)
├── manifest.json                  # add "nativeMessaging" permission
├── src/
│   └── utils/
│       ├── sync.ts                # NEW: native messaging wrapper
│       ├── storage.ts             # update updateSettings() to stamp lastModified
│       └── types.ts               # add lastModified to Settings, update DEFAULT_SETTINGS
```

## Installation Flow (User-facing)

1. Load extension in Chrome (as before — `dist/` folder)
2. Note the extension ID from `chrome://extensions/`
3. Run `./install.sh` in terminal — enter extension ID when prompted
4. If using multiple browsers, repeat step 1–3 for each browser
5. Done — sync is active across all configured browsers

## Not in Scope

- Real-time sync (polling/file watcher) — on-demand sync is sufficient
- Firefox support
- Linux / Windows support
- Cloud/remote sync
- Conflict resolution UI — last-write-wins is sufficient for a single-user, single-machine tool
