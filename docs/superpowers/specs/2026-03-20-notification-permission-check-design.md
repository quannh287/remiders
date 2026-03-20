# Notification Permission Check & Test Button

**Date:** 2026-03-20
**Status:** Approved

## Problem

The extension has no way to verify whether notifications will actually work. The current banner only shows a static "Notifications are disabled" message with a non-functional "Enable" button. Users can't tell why notifications aren't appearing, and there's no way to test them.

## Goals

1. Check extension-level notification permission (`chrome.notifications.getPermissionLevel()`)
2. Show a clear banner with instructions when permission is denied
3. Show a **Test** button in the footer when permission is granted, so users can verify notifications work end-to-end
4. Hide the banner entirely when permission is granted

## Non-Goals

- Checking `Notification.permission` (Web API) — this is a separate pipeline and does NOT gate `chrome.notifications.create()` in Chrome Extensions
- Calling `Notification.requestPermission()` from the popup — Chrome blocks this in extension popup pages
- Detecting OS-level notification blocking (Do Not Disturb, etc.) — not detectable from within an extension

## Technical Background

Chrome Extensions using `chrome.notifications` have one relevant permission check:

- `chrome.notifications.getPermissionLevel()` → `'granted'` or `'denied'`

With `"notifications"` in the manifest (already present), this returns `'granted'` for a correctly installed extension. The only realistic way it returns `'denied'` is if the user has manually disabled the extension's notifications in `chrome://settings/content/notifications`.

The Web Notifications API (`Notification.permission`, `Notification.requestPermission()`) is a separate pipeline used by web pages — it does not affect `chrome.notifications.create()` calls from an extension. Mixing the two would be technically incorrect.

## Design

### Permission Check Logic

On popup open, `checkNotificationPermission()` calls `chrome.notifications.getPermissionLevel()`:

- **`'granted'`** → hide banner, show Test button in footer
- **`'denied'`** → show banner with instructions (no Grant button — cannot request from popup)
- **Error / rejection** → treat as denied (show banner) — never silently hide the banner on failure

### Banner States

**State 1 — Permission denied:**
```
⚠ Notifications bị tắt
Vào chrome://settings/content/notifications để bật lại cho extension này.
```
- No grant button (technically not callable from extension popup)
- No test button

**State 2 — Permission granted:**
- Banner hidden
- **[Test 🔔]** button visible in footer (alongside Export and Settings buttons)

### Test Notification

On click, calls:
```ts
chrome.notifications.create('test-notify', {
  type: 'basic',
  iconUrl: 'icons/icon48.png',
  title: 'Work Timer',
  message: 'Notification hoạt động bình thường!',
});
```

The `'test-notify'` ID is intentional — Chrome silently replaces any existing notification with the same ID, making repeated test clicks idempotent.

If the notification still doesn't appear after clicking Test, the cause is OS-level blocking (e.g., Do Not Disturb) which the extension cannot detect or fix.

### Files Changed

| File | Change |
|------|--------|
| `src/popup/popup.ts` | Replace `checkNotificationPermission()` with new single-level check; remove existing `btn-enable-notify` click handler (line 331); add Test button handler |
| `src/popup/popup.html` | Remove `<button id="btn-enable-notify">` element entirely from the banner; update banner `<span>` text to Vietnamese instruction copy; add `<button id="btn-test-notify" class="hidden">` to footer (uses existing `hidden` class convention) |
| `src/popup/popup.css` | Minor tweaks if needed for banner layout |

### Removing Existing Conflicting Handler

The existing `btn-enable-notify` click handler at `popup.ts:331` replaces the banner's innerHTML with a settings instruction. This handler must be removed — the new design handles all banner content in `checkNotificationPermission()`. The `<button id="btn-enable-notify">` element in `popup.html:184` must also be deleted (not just unbound) as it is replaced by the static instruction text in the banner.

### Icon URL Resolution

`iconUrl: 'icons/icon48.png'` is resolved from the **extension root**, not from the popup file path. Do NOT use `'../icons/icon48.png'` — that would silently fail (notification appears without icon).

## Testing

- Load extension in Chrome with notifications allowed → banner hidden, Test button visible → click Test → notification appears
- Revoke extension notification permission in `chrome://settings/content/notifications` → reload popup → banner appears with instruction text, Test button hidden
- Click Test button multiple times → no duplicate notifications (idempotent via fixed ID)
