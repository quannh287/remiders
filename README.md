# Work Timer

Chrome extension that automatically tracks your work hours with check-in detection and checkout reminders.

## Features

- **Auto check-in** — Detects when you start working (via Chrome startup and idle detection) within work hours (6:00–11:00)
- **Manual check-in** — "Check in now" button or enter a custom time if you forgot
- **Live analog clock** — 160px clock face with real-time hour/minute hands, progress arc, and remaining time display
- **Countdown** — Shows time remaining until expected checkout
- **Progress tracking** — Visual arc around the clock fills as your workday progresses
- **Checkout reminder** — Chrome notification before your expected checkout time
- **Export history** — Download work history as CSV or JSON (last 90 days)
- **Configurable** — Adjust lunch break duration and notification timing

## Setup

### Prerequisites

- Node.js (v18+)
- npm
- Google Chrome

### Install & Build

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. The Work Timer icon appears in your toolbar

### After Code Changes

1. Run `npm run build` (or use `npm run watch`)
2. Go to `chrome://extensions/`
3. Click the reload icon on the Work Timer card
4. Close and reopen the popup to see changes

## Usage

### First Launch

When you first install or there's no check-in for today, you'll see an empty state with two options:

- **Check in now** — Records the current time as your check-in
- **Enter different time** — Manually type a check-in time (e.g., if you started earlier)

### Daily Workflow

1. **Open Chrome in the morning** — Auto check-in triggers if it's between 6:00–11:00
2. **Click the extension icon** — See the analog clock with your progress, remaining time, and work details
3. **Get notified** — A Chrome notification fires before your expected checkout (default: 15 minutes before)

### Editing Check-in

Click the **Check-in card** in the info grid to edit your check-in time.

### Settings

Click **Settings** in the footer to configure:

| Setting | Default | Range |
|---------|---------|-------|
| Lunch break | 60 minutes | 0–180 min |
| Notify before checkout | 15 minutes | 1–60 min |

### Exporting Data

1. Select format (CSV or JSON) from the dropdown
2. Click **Export**
3. A file downloads with your work history (up to 90 days)

## How Auto Check-in Works

The extension uses two signals to detect when you start working:

1. **`chrome.runtime.onStartup`** — Fires when Chrome opens (cold start)
2. **`chrome.idle.onStateChanged`** — Fires when you return from being idle (5 min threshold)

Both signals are guarded by work hours (6:00–11:00). Outside this window, auto check-in is disabled — use the manual check-in button instead.

## Project Structure

```
src/
├── background.ts          # Service worker: idle detection, alarms, notifications
├── popup/
│   ├── popup.html         # Popup UI markup
│   ├── popup.css          # Styles (Plus Jakarta Sans, flat design)
│   └── popup.ts           # Popup logic, clock, events
├── utils/
│   ├── types.ts           # Interfaces, constants, helpers
│   └── storage.ts         # Chrome storage API wrapper
└── icons/                 # Extension icons (16/48/128px)

tests/
├── background.test.ts     # Background service worker tests
├── popup/
│   └── popup.test.ts      # Popup helper function tests
├── utils/
│   ├── types.test.ts
│   └── storage.test.ts
└── setup-chrome.ts        # Chrome API mock for tests
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/background.test.ts --verbose
```

## Tech Stack

- **TypeScript** (strict mode)
- **Chrome Extension MV3**
- **Webpack 5** (bundler)
- **Jest** (testing)
- **Plus Jakarta Sans** (typography)
