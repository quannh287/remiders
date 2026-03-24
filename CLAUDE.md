# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Work Timer is a Chrome Extension (Manifest V3) that tracks work hours with automatic check-in detection and checkout reminders. The UI language mixes Vietnamese for user-facing notification strings.

## Commands

```bash
npm run build      # Production build via webpack → dist/
npm run watch      # Watch mode (auto-rebuild)
npm test           # Run all tests (Jest + ts-jest)
npx jest tests/background.test.ts --verbose  # Run a single test file
```

After building, load `dist/` as an unpacked extension in `chrome://extensions/` (Developer mode).

## Architecture

**Chrome Extension MV3** with two entry points bundled by Webpack:

- `src/background.ts` — Service worker. Handles auto check-in (via `chrome.idle.onStateChanged` and `chrome.runtime.onStartup`), checkout reminder alarms, and notifications. Auto check-in is gated to 6:00–11:00 (constants in `types.ts`). Uses a `processing` flag to prevent concurrent `handleActiveState` calls.
- `src/popup/popup.ts` — Popup UI logic. Renders an analog clock with progress arc, countdown, check-in/checkout times, settings panel, and CSV/JSON export. Pure helper functions (`formatTime`, `formatRemaining`, `calculateProgress`, `applyManualCheckIn`, `checkInNow`) are exported for testing; DOM code runs only when `document` exists.

**Shared utilities:**
- `src/utils/types.ts` — Interfaces (`AppState`, `CheckInRecord`, `Settings`), constants, and pure functions (`calculateCheckoutTime`, `createCheckInRecord`, `todayDateString`).
- `src/utils/storage.ts` — Thin wrapper around `chrome.storage.local`. All state lives under a single `appState` key. History is capped at 90 records.

**State model:** A single `AppState` object persisted in `chrome.storage.local` containing today's record, history array, settings, and last active timestamp.

## Testing

Tests are in `tests/`, mirroring `src/` structure. `tests/setup-chrome.ts` provides a minimal global `chrome` stub (configured via `jest.config.js` setupFiles). Tests override specific Chrome API methods as needed via jest mocks.

## Build Notes

- Webpack copies static assets (manifest.json, popup.html, popup.css, icons) via CopyPlugin.
- Terser mangles properties starting with `_` only. Properties from `AppState`, `CheckInRecord`, and `Settings` must NOT be prefixed with `_` — mangling serialized property names breaks persisted data.
- `drop_console` removes `console.log` but keeps `console.error`/`console.warn`.

## CI/CD

GitHub Actions workflow (`.github/workflows/release.yml`) triggers on `v*` tags: installs, builds, zips `dist/`, and creates a GitHub Release with the zip attached.
