# Empty State Check-in Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When no check-in exists (`state.today === null`), show an empty state UI with "Check in now" button and manual time input option, so the extension is usable from first load.

**Architecture:** Add an empty state section in popup.html that replaces countdown/progress/info-grid when `state.today` is null. `render()` toggles visibility between empty state and main content. Two new event handlers: instant check-in (uses `Date.now()`) and manual time check-in (reuses `applyManualCheckIn`). After check-in, re-render to show main UI.

**Tech Stack:** TypeScript, HTML, CSS (existing stack, no new deps)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/popup/popup.html` | Modify | Add empty state section |
| `src/popup/popup.css` | Modify | Add empty state styles |
| `src/popup/popup.ts` | Modify | Add `checkInNow()` helper, toggle logic in `render()`, bind new events |
| `tests/popup/popup.test.ts` | Modify | Add tests for `checkInNow()` |

---

## Chunk 1: Implementation

### Task 1: Add `checkInNow` helper with TDD

**Files:**
- Modify: `tests/popup/popup.test.ts`
- Modify: `src/popup/popup.ts`

- [ ] **Step 1: Write the failing test for `checkInNow`**

```typescript
// Add to tests/popup/popup.test.ts
import { formatTime, formatRemaining, calculateProgress, applyManualCheckIn, checkInNow } from '../../src/popup/popup';

describe('checkInNow', () => {
  it('creates check-in record with current time when state.today is null', () => {
    const state = createDefaultAppState();
    const before = Date.now();
    const result = checkInNow(state);
    const after = Date.now();

    expect(result.today).not.toBeNull();
    expect(result.today!.checkInTime).toBeGreaterThanOrEqual(before);
    expect(result.today!.checkInTime).toBeLessThanOrEqual(after);
    expect(result.today!.manualOverride).toBe(false);
  });

  it('does not overwrite existing check-in', () => {
    const state = createDefaultAppState();
    const existingTime = new Date('2026-03-18T08:00:00').getTime();
    state.today = {
      date: '2026-03-18',
      checkInTime: existingTime,
      expectedCheckoutTime: existingTime + 9 * 60 * 60 * 1000,
      manualOverride: false,
    };

    const result = checkInNow(state);
    expect(result.today!.checkInTime).toBe(existingTime);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/popup/popup.test.ts --verbose`
Expected: FAIL — `checkInNow` is not exported

- [ ] **Step 3: Write minimal implementation**

Add to `src/popup/popup.ts` after `applyManualCheckIn`:

```typescript
export function checkInNow(state: AppState): AppState {
  if (state.today) return state;
  const now = Date.now();
  state.today = {
    date: `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}-${String(new Date(now).getDate()).padStart(2, '0')}`,
    checkInTime: now,
    expectedCheckoutTime: calculateCheckoutTime(now, state.settings.lunchBreakMinutes),
    manualOverride: false,
  };
  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/popup/popup.test.ts --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add tests/popup/popup.test.ts src/popup/popup.ts
git commit -m "feat: add checkInNow helper with tests"
```

---

### Task 2: Add empty state HTML and CSS

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`

- [ ] **Step 1: Add empty state section to popup.html**

Add after the `</header>` closing tag, before the countdown hero comment:

```html
<!-- Empty State (shown when no check-in) -->
<div class="empty-state hidden" id="empty-state">
  <div class="empty-state__icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  </div>
  <div class="empty-state__text">Chưa check-in hôm nay</div>
  <button class="btn btn--primary" id="btn-checkin-now">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    Check in now
  </button>
  <button class="btn btn--ghost btn--sm" id="btn-checkin-manual-toggle">Nhập giờ khác</button>
  <div class="empty-state__manual hidden" id="manual-checkin-row">
    <input type="time" id="manual-checkin-input" aria-label="Manual check-in time">
    <button class="btn btn--primary btn--sm" id="btn-manual-checkin-save">Save</button>
    <button class="btn btn--sm" id="btn-manual-checkin-cancel">Cancel</button>
  </div>
</div>
```

- [ ] **Step 2: Add empty state CSS to popup.css**

Add before the `/* --- Utility --- */` section:

```css
/* --- Empty State --- */
.empty-state {
  text-align: center;
  padding: 24px 16px;
  margin-bottom: 16px;
}

.empty-state__icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  color: var(--color-text-muted);
}

.empty-state__icon svg {
  width: 48px;
  height: 48px;
}

.empty-state__text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.empty-state .btn--primary {
  width: 100%;
  margin-bottom: 8px;
}

.empty-state .btn--ghost {
  width: 100%;
}

.empty-state__manual {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  animation: slide-down 200ms ease;
}

.empty-state__manual input[type="time"] {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  transition: border-color var(--transition-fast);
}

.empty-state__manual input[type="time"]:focus {
  border-color: var(--color-primary);
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: compiled successfully

- [ ] **Step 4: Commit**

```bash
git add src/popup/popup.html src/popup/popup.css
git commit -m "feat: add empty state HTML and CSS"
```

---

### Task 3: Wire up empty state logic in popup.ts

**Files:**
- Modify: `src/popup/popup.ts`

- [ ] **Step 1: Add wrapper IDs for main content sections**

Wrap the countdown hero, progress, and info grid in popup.html with a div:

```html
<!-- Main Content (shown when checked in) -->
<div id="main-content">
  <!-- Countdown Hero -->
  ...existing countdown-hero, progress-container, info-grid sections...
</div>
```

- [ ] **Step 2: Update `render()` to toggle empty state vs main content**

Add at the start of `render()`, after element lookups:

```typescript
const emptyState = document.getElementById('empty-state')!;
const mainContent = document.getElementById('main-content')!;

if (state.today) {
  emptyState.classList.add('hidden');
  mainContent.classList.remove('hidden');
} else {
  emptyState.classList.remove('hidden');
  mainContent.classList.add('hidden');
}
```

- [ ] **Step 3: Add event bindings in `bindEvents()`**

```typescript
// Check in now
document.getElementById('btn-checkin-now')!.addEventListener('click', async () => {
  const state = await getState();
  checkInNow(state);
  await setState(state);

  chrome.alarms.create('checkout-reminder', {
    when: state.today!.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
  });

  render(state);
});

// Toggle manual check-in input
document.getElementById('btn-checkin-manual-toggle')!.addEventListener('click', () => {
  document.getElementById('manual-checkin-row')!.classList.remove('hidden');
});

document.getElementById('btn-manual-checkin-cancel')!.addEventListener('click', () => {
  document.getElementById('manual-checkin-row')!.classList.add('hidden');
});

// Save manual check-in from empty state
document.getElementById('btn-manual-checkin-save')!.addEventListener('click', async () => {
  const input = document.getElementById('manual-checkin-input') as HTMLInputElement;
  const [hours, minutes] = input.value.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return;

  const state = await getState();
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  applyManualCheckIn(state, now.getTime());
  await setState(state);

  chrome.alarms.create('checkout-reminder', {
    when: state.today!.expectedCheckoutTime - state.settings.notifyBeforeMinutes * 60000,
  });

  render(state);
});
```

- [ ] **Step 4: Run full test suite and build**

Run: `npm test && npm run build`
Expected: 34 tests pass, build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts
git commit -m "feat: wire empty state check-in logic"
```
