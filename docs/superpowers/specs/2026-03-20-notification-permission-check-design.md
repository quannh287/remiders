# Notification Permission Check & Test Button

**Date:** 2026-03-20
**Status:** Approved

## Problem

The extension has no way to verify whether notifications will actually work. There are two separate permission layers — extension-level and browser/OS-level — and currently neither is checked properly. Users can't tell why notifications aren't appearing, and there's no way to test them.

## Goals

1. Check both extension permission (`chrome.notifications.getPermissionLevel`) and browser permission (`Notification.permission`)
2. Show a clear banner when either is missing, with a "Grant" button where requestable
3. Show a "Test" button in the footer when all permissions are granted
4. Hide the banner entirely when all permissions are OK

## Non-Goals

- Persisting permission state across sessions (always check live on popup open)
- Handling OS-level notification blocking (out of scope — OS varies too much)

## Design

### Permission Check Logic

On popup open, call `checkNotificationPermission()` which checks:

1. `chrome.notifications.getPermissionLevel()` → extension permission
2. `Notification.permission` → browser permission

Both must be `'granted'` for the banner to hide and the Test button to appear.

### Banner States

**State 1 — Extension permission denied** (edge case, usually means manifest issue):
- Show: `⚠ Extension chưa được cấp quyền notification`
- No grant button (can't request from popup)
- No test button

**State 2 — Browser permission not granted** (`'default'` or `'denied'`):
- Show: `🔔 Browser chưa cho phép notification` + **[Grant]** button
- Clicking Grant calls `Notification.requestPermission()`
- On success: re-run check, hide banner, show Test button
- On denial: update banner text to reflect denied state (no retry)

**State 3 — All granted:**
- Hide banner
- Show **[Test 🔔]** button in popup footer (alongside Export and Settings)

### Test Notification

Calls `chrome.notifications.create('test-notify', { ... })` with:
- Title: `Work Timer`
- Message: `Notification hoạt động bình thường!`
- Icon: `icons/icon48.png`
- Type: `basic`

### Files Changed

| File | Change |
|------|--------|
| `src/popup/popup.ts` | Replace `checkNotificationPermission()` with new multi-level check; add grant handler; add test handler |
| `src/popup/popup.html` | Update banner markup for new states; add Test button to footer |
| `src/popup/popup.css` | Minor tweaks if needed for new banner layout |

### No New Abstractions

All logic stays inside `popup.ts`. No new files, no new utilities. The existing `notification-warning` element is reused and its content updated dynamically.

## Testing

- Manual test: load extension in Chrome, verify banner appears when notification permission is not granted
- Manual test: click Grant → browser prompt appears → grant → banner hides → Test button appears
- Manual test: click Test → notification appears within 1 second
- Manual test: revoke browser notification permission → reload popup → banner reappears
