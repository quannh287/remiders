# Cross-Profile Sync via Native Messaging — Design Spec

## Overview

Add data synchronization across multiple Chrome profiles and Chromium-based browsers (Chrome, Brave, Edge, Arc, etc.) on the same machine. Uses Chrome's Native Messaging mechanism to communicate with a shared native host process that reads/writes a single JSON file on disk. No persistent background service required — the native host is spawned on demand by Chrome and killed when done.

## Goals

- Sync `AppState` (today's check-in, history, settings) across all Chromium-based browsers on the same machine
- No Google account dependency — works across different accounts and browser vendors
- Graceful fallback if native host is not installed — extension continues working as before
- On-demand sync: sync when popup opens and on write events (check-in, settings change)

## Architecture

```
Chrome Profile A                    Chrome Profile B / Brave / Edge
┌─────────────────┐                ┌─────────────────┐
│  background.ts  │                │  background.ts  │
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

Writes are atomic: write to `~/.worktimer/data.json.tmp` then rename to `~/.worktimer/data.json` to prevent corruption if two profiles write simultaneously.

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
- Detect which Chromium browsers are installed on the machine:
  - Chrome: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
  - Brave: `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
  - Edge: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`
- For each detected browser, prompt user to enter the extension ID, generate the manifest with the correct `allowed_origins`, and copy to the browser's `NativeMessagingHosts/` directory
- Create `~/.worktimer/` directory if it does not exist
- Make `worktimer-host.js` executable (`chmod +x`)

### 4. Sync Layer (`src/utils/sync.ts`)

Wrapper around `chrome.runtime.sendNativeMessage()`:

```typescript
const HOST_NAME = "com.worktimer.host";

async function readSharedState(): Promise<AppState | null>
async function writeSharedState(state: AppState): Promise<void>
```

If the native host is not available (not installed, Node.js missing, any runtime error) → log a warning and return `null` / silently skip write. Extension falls back to `chrome.storage.local` behavior as before — no crash, no user-visible error.

### 5. Integration Points

**`background.ts`** — after every check-in creation or settings change:
```typescript
await writeSharedState(newState);
```

**`popup.ts`** — on popup open, before rendering:
```typescript
const shared = await readSharedState();
const local = await getStoredState();
const merged = mergeStates(shared, local);
await saveState(merged);
// render from merged
```

## Merge Logic

Last-write-wins based on timestamps. Applied when popup opens and compares shared state from file vs local `chrome.storage.local` state.

### Today's check-in

```
if shared.today is null → use local
if local.today is null → use shared
if shared.today.checkInTime > local.today.checkInTime → use shared
else → use local, write local back to shared file
```

If `manualOverride = true` on either side, prefer the manually overridden record regardless of timestamp.

### History

Merge as union keyed by `date`. For duplicate dates, prefer the record with `manualOverride = true`, otherwise prefer the more recent `checkInTime`. Sort descending by date, trim to 90 entries.

### Settings

Compare `lastModified` timestamp (add this field to `Settings` interface). Use whichever is newer.

## Data Model Changes

Add `lastModified` to `Settings`:

```typescript
interface Settings {
  lunchBreakMinutes: number;
  notifyBeforeMinutes: number;
  lastModified: number;  // timestamp ms, set on every settings save
}
```

No other changes to existing data model.

## Edge Cases

| Scenario | Handling |
|---|---|
| Native host not installed | `sync.ts` catches the error, returns `null`, extension uses `chrome.storage.local` only |
| `~/.worktimer/data.json` missing | Native host returns `null`; extension treats as first-run for sync |
| Corrupt / invalid JSON in file | Native host returns error; `sync.ts` logs warning, falls back to local state |
| Two profiles write simultaneously | Atomic write (tmp → rename) prevents partial reads; last rename wins |
| Different extension IDs across browsers | Each browser gets its own manifest with its own `allowed_origins`; same host binary |
| Node.js not in PATH | Install script checks and exits with clear error message before registering anything |
| Firefox | Not supported — Firefox uses a different extension system. Native Messaging protocol is the same but Firefox extensions are separate packages. Out of scope. |

## File Structure Changes

```
reminder/
├── native-host/
│   ├── worktimer-host.js          # Native messaging host (Node.js)
│   └── com.worktimer.host.json    # Manifest template
├── install.sh                     # One-time install script
├── src/
│   └── utils/
│       ├── sync.ts                # NEW: native messaging wrapper
│       ├── storage.ts             # unchanged
│       └── types.ts               # add lastModified to Settings
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
- Cloud/remote sync
- Conflict resolution UI — last-write-wins is sufficient for a single-user, single-machine tool
