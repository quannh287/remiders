# Notification Permission Check & Test Button Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken notification banner with a correct permission check and add a Test button that sends a real notification.

**Architecture:** Update `checkNotificationPermission()` in `popup.ts` to use `chrome.notifications.getPermissionLevel()` with error handling, update the banner HTML to remove the non-functional Enable button, and add a Test button in the footer that calls `chrome.notifications.create()`.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, Jest + ts-jest

**Spec:** `docs/superpowers/specs/2026-03-20-notification-permission-check-design.md`

---

## Chunk 1: HTML Changes

### Task 1: Update popup.html

**Files:**
- Modify: `src/popup/popup.html:177-185` (banner section)
- Modify: `src/popup/popup.html:188-208` (footer section)

**What the current HTML looks like (lines 177–185):**
```html
<div class="notification-warning hidden" id="notification-warning">
  <svg ...>...</svg>
  <span>Notifications are disabled</span>
  <button class="btn btn--sm btn--danger" id="btn-enable-notify">Enable</button>
</div>
```

**What the footer currently looks like (lines 188–208):**
```html
<footer class="footer">
  <select id="export-format" ...>...</select>
  <button class="btn" id="btn-export">...</button>
  <button class="btn" id="btn-settings">...</button>
</footer>
```

- [ ] **Step 1: Remove `btn-enable-notify` and update banner text**

In `src/popup/popup.html`, replace the banner block (lines 177–185):

```html
<!-- Notification Warning -->
<div class="notification-warning hidden" id="notification-warning">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
  <span>Notifications bị tắt. Vào chrome://settings/content/notifications để bật lại.</span>
</div>
```

Note: The `<button id="btn-enable-notify">` is completely removed — not just hidden.

- [ ] **Step 2: Add Test button to footer**

In `src/popup/popup.html`, add `btn-test-notify` as the first child of `<footer class="footer">`, before `<select id="export-format">`:

```html
<footer class="footer">
  <button class="btn hidden" id="btn-test-notify">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    Test notif
  </button>
  <select id="export-format" aria-label="Export format">
    <option value="csv">CSV</option>
    <option value="json">JSON</option>
  </select>
  <button class="btn" id="btn-export">
    ...existing export button content unchanged...
  </button>
  <button class="btn" id="btn-settings">
    ...existing settings button content unchanged...
  </button>
</footer>
```

Important: only add the `btn-test-notify` button — do not change the export or settings buttons.

> **Layout note:** When `btn-test-notify` is visible, the footer will have 3 `flex: 1` buttons plus a `<select>`. If the footer looks cramped after wiring up the show/hide logic in Chunk 2, add `flex: none` to `#btn-test-notify` in `popup.css` to prevent it from expanding. Do not adjust CSS prematurely — check layout only after the full feature is wired up.

> **Warning:** Do not load the extension in Chrome after this commit. The `btn-enable-notify` event listener in `popup.ts:331` still exists and references the now-deleted button — it will throw a runtime error. The extension is only safe to load after Chunk 2 is complete.

- [ ] **Step 3: Build and verify no compile errors**

```bash
cd /Users/quannh2871/Development/reminder && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/popup/popup.html
git commit -m "feat: update notification banner HTML and add test button"
```

---

## Chunk 2: TypeScript Logic

### Task 2: Update `checkNotificationPermission()` and add test button handler

**Files:**
- Modify: `src/popup/popup.ts:331-341` (remove old btn-enable-notify handler in `bindEvents()`)
- Modify: `src/popup/popup.ts:375-383` (replace `checkNotificationPermission()`)
- Test: `tests/popup/popup.test.ts` (add test for exported permission helper)

**Background:** The current `checkNotificationPermission()` at line 375 already calls `chrome.notifications.getPermissionLevel()` but doesn't handle errors and doesn't show/hide the test button. The `bindEvents()` at line 331 has a handler for the now-deleted `btn-enable-notify` — this must be removed.

- [ ] **Step 1: Write failing test for permission-level helper**

In `tests/popup/popup.test.ts`, add `isNotificationGranted` to the **existing** import on line 1:

```ts
import { formatTime, formatRemaining, calculateProgress, applyManualCheckIn, checkInNow, isNotificationGranted } from '../../src/popup/popup';
```

Then add the following describe block at the end of the file:

```ts
describe('isNotificationGranted', () => {
  it('returns true for granted', () => {
    expect(isNotificationGranted('granted')).toBe(true);
  });

  it('returns false for denied', () => {
    expect(isNotificationGranted('denied')).toBe(false);
  });

  it('returns false for any other string', () => {
    expect(isNotificationGranted('unknown')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/quannh2871/Development/reminder && npx jest tests/popup/popup.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `isNotificationGranted` is not exported.

- [ ] **Step 3: Export `isNotificationGranted` from popup.ts**

In `src/popup/popup.ts`, add this function near the top with the other exported helpers (after `checkInNow`, around line 56):

```ts
export function isNotificationGranted(level: string): boolean {
  return level === 'granted';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/quannh2871/Development/reminder && npx jest tests/popup/popup.test.ts --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Replace `checkNotificationPermission()` in popup.ts**

Find the existing function (around line 375):

```ts
async function checkNotificationPermission(): Promise<void> {
  const level = await chrome.notifications.getPermissionLevel();
  const warning = document.getElementById('notification-warning')!;
  if (level !== 'granted') {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}
```

Replace it with:

```ts
async function checkNotificationPermission(): Promise<void> {
  const warning = document.getElementById('notification-warning')!;
  const testBtn = document.getElementById('btn-test-notify')!;
  let granted = false;

  try {
    const level = await chrome.notifications.getPermissionLevel();
    granted = isNotificationGranted(level);
  } catch {
    granted = false;
  }

  if (granted) {
    warning.classList.add('hidden');
    testBtn.classList.remove('hidden');
  } else {
    warning.classList.remove('hidden');
    testBtn.classList.add('hidden');
  }
}
```

- [ ] **Step 6: Remove `btn-enable-notify` handler from `bindEvents()`**

Delete lines 330–341 in `src/popup/popup.ts`. The exact block to remove is:

```ts
  // Enable notifications
  document.getElementById('btn-enable-notify')!.addEventListener('click', () => {
    const warning = document.getElementById('notification-warning')!;
    warning.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Go to Chrome Settings &gt; Privacy &gt; Notifications and enable for this extension</span>
    `;
  });
```

After deletion, the blank line before `// Export` (previously line 343) should remain.

- [ ] **Step 7: Add `btn-test-notify` handler in `bindEvents()`**

> **Note on test coverage:** This handler calls `chrome.notifications.create(...)` which is a DOM/Chrome API side effect. The project uses `testEnvironment: 'node'` (no DOM) and the chrome stub uses plain arrow functions, not `jest.fn()`. Testing this handler would require converting the stub to `jest.fn()` and adding a DOM environment — out of scope for this plan. The handler is verified via manual testing in the checklist below.

In `bindEvents()`, add after the export button handler (after the `btn-export` listener block):

```ts
// Test notification
document.getElementById('btn-test-notify')!.addEventListener('click', () => {
  chrome.notifications.create('test-notify', {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Work Timer',
    message: 'Notification hoạt động bình thường!',
  });
});
```

- [ ] **Step 8: Run all tests**

```bash
cd /Users/quannh2871/Development/reminder && npx jest --no-coverage 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 9: Build**

```bash
cd /Users/quannh2871/Development/reminder && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/popup/popup.ts tests/popup/popup.test.ts
git commit -m "feat: check notification permission with error handling and add test button"
```

---

## Manual Verification Checklist

After loading the built extension in Chrome (`chrome://extensions` → Load unpacked → select `dist/`):

- [ ] Open popup → banner is hidden, "Test notif" button is visible in footer
- [ ] Click "Test notif" → a Chrome notification appears immediately with title "Work Timer"
- [ ] Click "Test notif" again → no duplicate (same notification ID replaces existing)
- [ ] Go to `chrome://settings/content/notifications` → find the extension → Block it
- [ ] Reload popup → banner appears with Vietnamese instruction text, "Test notif" button is hidden
- [ ] Re-allow notifications → reload popup → banner hides again, test button reappears
