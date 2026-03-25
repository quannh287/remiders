# Screen Time Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable heatmap dashboard with hourly/daily bar charts, add sessions/breaks metrics, and introduce daily aggregates for long-term data retention.

**Architecture:** Add `DailyAggregate` to the data model (upserted on session end, trimmed at 90 days). Dashboard switches between hourly bar chart (Today) and daily bar chart with drill-down (7d/30d/90d). Metric cards expand from 3 to 4 (add sessions + breaks). Remove `chartjs-chart-matrix` dependency.

**Tech Stack:** TypeScript, Chart.js (bar chart), Chrome Extension MV3, Jest + ts-jest

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/screen-time/types.ts` | Add `DailyAggregate` interface, update `ScreenTimeState` | Modify |
| `src/screen-time/storage.ts` | Add migration logic (schema v1→v2) | Modify |
| `src/screen-time/tracker.ts` | Upsert daily aggregates on session end, trim them | Modify |
| `src/screen-time/dashboard-utils.ts` | New stats functions, remove heatmap transform | Modify |
| `src/screen-time/dashboard.html` | 4 metric cards, rename canvas container | Modify |
| `src/screen-time/dashboard.css` | 4-column grid, drill-down panel styles | Modify |
| `src/screen-time/dashboard.ts` | Bar charts, drill-down click, 4-card rendering | Modify |
| `tests/screen-time/dashboard.test.ts` | Tests for new stats, remove heatmap tests | Modify |
| `tests/screen-time/tracker.test.ts` | Tests for daily aggregate upsert | Modify |
| `tests/screen-time/storage.test.ts` | Tests for migration | Modify |
| `package.json` | Remove `chartjs-chart-matrix` | Modify |
| `webpack.config.js` | Remove matrix from terser mangle note (cosmetic) | No change needed |

---

### Task 1: Data Model — Add DailyAggregate

**Files:**
- Modify: `src/screen-time/types.ts`

- [ ] **Step 1: Add DailyAggregate interface and update ScreenTimeState**

In `src/screen-time/types.ts`, add the new interface before `ScreenTimeState` and update the state:

```typescript
export interface DailyAggregate {
  date: string;           // "YYYY-MM-DD"
  totalMinutes: number;
  sessionCount: number;
  breakCount: number;
}
```

Add `dailyAggregates: DailyAggregate[]` to `ScreenTimeState` interface. Update `createDefaultScreenTimeState` to include `dailyAggregates: []` and change `schemaVersion` to `2`.

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: Compilation errors in files that reference `ScreenTimeState` but don't include `dailyAggregates` — this is expected and will be fixed in later tasks. The types file itself should be valid.

- [ ] **Step 3: Commit**

```bash
git add src/screen-time/types.ts
git commit -m "feat(screen-time): add DailyAggregate interface to data model"
```

---

### Task 2: Storage Migration — Schema v1 to v2

**Files:**
- Modify: `src/screen-time/storage.ts`
- Test: `tests/screen-time/storage.test.ts`

- [ ] **Step 1: Write failing tests for migration**

In `tests/screen-time/storage.test.ts`, add tests for `migrateScreenTimeState`:

```typescript
import { migrateScreenTimeState } from '../../src/screen-time/storage';
import { ScreenTimeState } from '../../src/screen-time/types';

describe('migrateScreenTimeState', () => {
  it('adds dailyAggregates to v1 state', () => {
    const v1 = {
      sessions: [],
      hourlySlots: {},
      currentSession: null,
      settings: { idleThresholdMinutes: 5 },
      schemaVersion: 1,
    } as any;
    const result = migrateScreenTimeState(v1);
    expect(result.dailyAggregates).toEqual([]);
    expect(result.schemaVersion).toBe(2);
  });

  it('backfills totalMinutes from hourly slots', () => {
    const v1 = {
      sessions: [],
      hourlySlots: {
        '2026-03-20-10': 30,
        '2026-03-20-11': 45,
        '2026-03-21-09': 60,
      },
      currentSession: null,
      settings: { idleThresholdMinutes: 5 },
      schemaVersion: 1,
    } as any;
    const result = migrateScreenTimeState(v1);
    const agg20 = result.dailyAggregates.find((a: any) => a.date === '2026-03-20');
    const agg21 = result.dailyAggregates.find((a: any) => a.date === '2026-03-21');
    expect(agg20).toEqual({ date: '2026-03-20', totalMinutes: 75, sessionCount: 0, breakCount: 0 });
    expect(agg21).toEqual({ date: '2026-03-21', totalMinutes: 60, sessionCount: 0, breakCount: 0 });
  });

  it('computes sessionCount from sessions within 7-day window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-25T12:00:00'));
    const v1 = {
      sessions: [
        { start: new Date('2026-03-25T09:00:00').getTime(), end: new Date('2026-03-25T10:00:00').getTime(), type: 'active' },
        { start: new Date('2026-03-25T11:00:00').getTime(), end: new Date('2026-03-25T12:00:00').getTime(), type: 'active' },
        { start: new Date('2026-03-25T10:00:00').getTime(), end: new Date('2026-03-25T10:30:00').getTime(), type: 'idle' },
      ],
      hourlySlots: {
        '2026-03-25-09': 60,
        '2026-03-25-10': 30,
        '2026-03-25-11': 60,
      },
      currentSession: null,
      settings: { idleThresholdMinutes: 5 },
      schemaVersion: 1,
    } as any;
    const result = migrateScreenTimeState(v1);
    const agg = result.dailyAggregates.find((a: any) => a.date === '2026-03-25');
    expect(agg!.sessionCount).toBe(2); // only active sessions
    expect(agg!.breakCount).toBe(1);   // sessionCount - 1
    jest.useRealTimers();
  });

  it('does not re-migrate v2 state', () => {
    const v2 = {
      sessions: [],
      hourlySlots: {},
      dailyAggregates: [{ date: '2026-03-20', totalMinutes: 30, sessionCount: 1, breakCount: 0 }],
      currentSession: null,
      settings: { idleThresholdMinutes: 5 },
      schemaVersion: 2,
    } as any;
    const result = migrateScreenTimeState(v2);
    expect(result.dailyAggregates).toHaveLength(1);
    expect(result.schemaVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/storage.test.ts --verbose`
Expected: FAIL — `migrateScreenTimeState` is not exported

- [ ] **Step 3: Implement migrateScreenTimeState**

In `src/screen-time/storage.ts`, add and export `migrateScreenTimeState`. This function:
1. If `schemaVersion >= 2`, return as-is
2. Initialize `dailyAggregates` as `[]`
3. Backfill `totalMinutes` from `hourlySlots` grouped by date
4. For dates that have sessions in the `sessions[]` array, compute `sessionCount` (only type `'active'`) and `breakCount` (`sessionCount - 1`, min 0)
5. Set `schemaVersion = 2`

```typescript
import { ScreenTimeState, DailyAggregate } from './types';

export function migrateScreenTimeState(state: ScreenTimeState): ScreenTimeState {
  if (state.schemaVersion >= 2) return state;

  // Backfill totalMinutes from hourly slots
  const dayMinutes: Record<string, number> = {};
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    const datePart = key.substring(0, 10);
    dayMinutes[datePart] = (dayMinutes[datePart] || 0) + val;
  }

  // Count active sessions per day from sessions array
  const daySessions: Record<string, number> = {};
  for (const s of state.sessions) {
    if (s.type !== 'active') continue;
    const d = new Date(s.start);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    daySessions[dateStr] = (daySessions[dateStr] || 0) + 1;
  }

  // Build aggregates for all dates with slot data
  const allDates = new Set([...Object.keys(dayMinutes), ...Object.keys(daySessions)]);
  const aggregates: DailyAggregate[] = [];
  for (const date of allDates) {
    const sessionCount = daySessions[date] || 0;
    aggregates.push({
      date,
      totalMinutes: dayMinutes[date] || 0,
      sessionCount,
      breakCount: Math.max(0, sessionCount - 1),
    });
  }

  state.dailyAggregates = aggregates;
  state.schemaVersion = 2;
  return state;
}
```

Call `migrateScreenTimeState` inside `getScreenTimeState` after reading from storage (before returning).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/storage.test.ts --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/storage.ts tests/screen-time/storage.test.ts
git commit -m "feat(screen-time): add schema v1→v2 migration with daily aggregates backfill"
```

---

### Task 3: Tracker — Upsert Daily Aggregates on Session End

**Files:**
- Modify: `src/screen-time/tracker.ts`
- Test: `tests/screen-time/tracker.test.ts`

- [ ] **Step 1: Write failing test for upsertDailyAggregate**

Add to `tests/screen-time/tracker.test.ts`:

```typescript
import { upsertDailyAggregate } from '../../src/screen-time/tracker';
import { createDefaultScreenTimeState } from '../../src/screen-time/types';

describe('upsertDailyAggregate', () => {
  it('creates new aggregate for a date', () => {
    const state = createDefaultScreenTimeState();
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-11': 30 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates).toHaveLength(1);
    expect(state.dailyAggregates[0]).toEqual({
      date: '2026-03-25',
      totalMinutes: 75,
      sessionCount: 1,
      breakCount: 0,
    });
  });

  it('increments sessionCount on existing aggregate', () => {
    const state = createDefaultScreenTimeState();
    state.dailyAggregates = [{ date: '2026-03-25', totalMinutes: 45, sessionCount: 1, breakCount: 0 }];
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-14': 30 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates[0].sessionCount).toBe(2);
    expect(state.dailyAggregates[0].breakCount).toBe(1);
    expect(state.dailyAggregates[0].totalMinutes).toBe(75);
  });

  it('recomputes totalMinutes from hourly slots', () => {
    const state = createDefaultScreenTimeState();
    state.dailyAggregates = [{ date: '2026-03-25', totalMinutes: 30, sessionCount: 1, breakCount: 0 }];
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-11': 60 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates[0].totalMinutes).toBe(105);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/tracker.test.ts --verbose`
Expected: FAIL — `upsertDailyAggregate` is not exported

- [ ] **Step 3: Implement upsertDailyAggregate**

In `src/screen-time/tracker.ts`, add and export:

```typescript
export function upsertDailyAggregate(state: ScreenTimeState, dateStr: string): void {
  // Recompute totalMinutes from hourly slots for this date
  let totalMinutes = 0;
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    if (key.substring(0, 10) === dateStr) {
      totalMinutes += val;
    }
  }

  const existing = state.dailyAggregates.find((a) => a.date === dateStr);
  if (existing) {
    existing.sessionCount += 1;
    existing.breakCount = Math.max(0, existing.sessionCount - 1);
    existing.totalMinutes = totalMinutes;
  } else {
    state.dailyAggregates.push({
      date: dateStr,
      totalMinutes,
      sessionCount: 1,
      breakCount: 0,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/tracker.test.ts --verbose`
Expected: All PASS

- [ ] **Step 5: Call upsertDailyAggregate in handleScreenTimeStateChange**

In `handleScreenTimeStateChange`, after pushing a closed active session to `state.sessions`, call `upsertDailyAggregate`. Add a helper to extract the date string from a timestamp:

```typescript
function dateStrFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

In the `newState === 'active'` branch (line 75-78, closing duplicate active), add after `state.sessions.push(...)`:
```typescript
if (state.currentSession.type === 'active') {
  upsertDailyAggregate(state, dateStrFromTimestamp(state.currentSession.start));
}
```

In the `else` branch (line 82-88, going idle/locked), add after `state.sessions.push(...)`:
```typescript
if (state.currentSession.type === 'active') {
  upsertDailyAggregate(state, dateStrFromTimestamp(state.currentSession.start));
}
```

- [ ] **Step 6: Update trimOldData to trim daily aggregates**

In `trimOldData`, add after the hourly slots trimming loop:

```typescript
const cutoffDate = new Date(now - SLOT_RETENTION_MS);
const slotCutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
state.dailyAggregates = state.dailyAggregates.filter((a) => a.date >= slotCutoffStr);
```

- [ ] **Step 7: Run all tracker tests**

Run: `npx jest tests/screen-time/tracker.test.ts --verbose`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/screen-time/tracker.ts tests/screen-time/tracker.test.ts
git commit -m "feat(screen-time): upsert daily aggregates on active session end"
```

---

### Task 4: Dashboard Utils — New Stats Functions

**Files:**
- Modify: `src/screen-time/dashboard-utils.ts`
- Test: `tests/screen-time/dashboard.test.ts`

- [ ] **Step 1: Write failing tests for new stats**

Replace the contents of `tests/screen-time/dashboard.test.ts`:

```typescript
import { calculateStats, filterSlotsByRange, calculateTodaySessionStats, transformForBarChart, transformForDailyBarChart } from '../../src/screen-time/dashboard-utils';
import { HourlySlotMap, DailyAggregate, ScreenSession } from '../../src/screen-time/types';

describe('dashboard utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-23T12:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('filterSlotsByRange', () => {
    it('filters slots to last N days', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 45,
        '2026-03-22-09': 30,
        '2026-03-10-14': 60,
      };
      const filtered = filterSlotsByRange(slots, 7);
      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered['2026-03-10-14']).toBeUndefined();
    });

    it('filters to today only when days === 0', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 45,
        '2026-03-23-14': 20,
        '2026-03-22-09': 30,
      };
      const filtered = filterSlotsByRange(slots, 0);
      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered['2026-03-23-10']).toBe(45);
      expect(filtered['2026-03-23-14']).toBe(20);
    });
  });

  describe('calculateStats', () => {
    it('calculates average daily minutes and peak hour', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 30,
        '2026-03-23-11': 30,
        '2026-03-22-10': 60,
      };
      const aggregates: DailyAggregate[] = [
        { date: '2026-03-23', totalMinutes: 60, sessionCount: 3, breakCount: 2 },
        { date: '2026-03-22', totalMinutes: 60, sessionCount: 2, breakCount: 1 },
      ];
      const stats = calculateStats(slots, 7, aggregates);
      expect(stats.avgDailyMinutes).toBe(60);
      expect(stats.peakHour).toBe(10);
    });

    it('computes avg sessions and breaks from aggregates for multi-day', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 30,
        '2026-03-22-10': 60,
      };
      const aggregates: DailyAggregate[] = [
        { date: '2026-03-23', totalMinutes: 30, sessionCount: 4, breakCount: 3 },
        { date: '2026-03-22', totalMinutes: 60, sessionCount: 6, breakCount: 5 },
      ];
      const stats = calculateStats(slots, 7, aggregates);
      expect(stats.avgSessionsPerDay).toBe(5);   // (4+6)/2
      expect(stats.avgBreaksPerDay).toBe(4);     // (3+5)/2
    });
  });

  describe('calculateTodaySessionStats', () => {
    it('counts active sessions and breaks for today', () => {
      const sessions: ScreenSession[] = [
        { start: new Date('2026-03-23T09:00:00').getTime(), end: new Date('2026-03-23T10:00:00').getTime(), type: 'active' },
        { start: new Date('2026-03-23T10:00:00').getTime(), end: new Date('2026-03-23T10:30:00').getTime(), type: 'idle' },
        { start: new Date('2026-03-23T10:30:00').getTime(), end: new Date('2026-03-23T12:00:00').getTime(), type: 'active' },
      ];
      const result = calculateTodaySessionStats(sessions, null);
      expect(result.sessionCount).toBe(2);
      expect(result.breakCount).toBe(1);
    });

    it('includes currentSession if open', () => {
      const sessions: ScreenSession[] = [
        { start: new Date('2026-03-23T09:00:00').getTime(), end: new Date('2026-03-23T10:00:00').getTime(), type: 'active' },
      ];
      const current: ScreenSession = {
        start: new Date('2026-03-23T11:00:00').getTime(), end: null, type: 'active',
      };
      const result = calculateTodaySessionStats(sessions, current);
      expect(result.sessionCount).toBe(2);
      expect(result.breakCount).toBe(1);
    });

    it('ignores non-active sessions', () => {
      const sessions: ScreenSession[] = [
        { start: new Date('2026-03-23T09:00:00').getTime(), end: new Date('2026-03-23T10:00:00').getTime(), type: 'idle' },
        { start: new Date('2026-03-23T10:00:00').getTime(), end: new Date('2026-03-23T11:00:00').getTime(), type: 'active' },
      ];
      const result = calculateTodaySessionStats(sessions, null);
      expect(result.sessionCount).toBe(1);
      expect(result.breakCount).toBe(0);
    });
  });

  describe('transformForBarChart', () => {
    it('transforms hourly slots to bar chart data', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-09': 30,
        '2026-03-23-14': 45,
      };
      const data = transformForBarChart(slots);
      expect(data.labels).toEqual(['9', '14']);
      expect(data.values).toEqual([30, 45]);
    });
  });

  describe('transformForDailyBarChart', () => {
    it('transforms hourly slots to daily totals', () => {
      const slots: HourlySlotMap = {
        '2026-03-22-09': 30,
        '2026-03-22-14': 20,
        '2026-03-23-10': 45,
      };
      const data = transformForDailyBarChart(slots);
      expect(data.labels).toEqual(['2026-03-22', '2026-03-23']);
      expect(data.values).toEqual([50, 45]);
      expect(data.average).toBe(48); // round((50+45)/2)
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/screen-time/dashboard.test.ts --verbose`
Expected: FAIL — new functions not exported

- [ ] **Step 3: Rewrite dashboard-utils.ts**

Replace `src/screen-time/dashboard-utils.ts` with:

```typescript
import { HourlySlotMap, DailyAggregate, ScreenSession } from './types';

export interface DashboardStats {
  avgDailyMinutes: number;
  peakHour: number;
  avgSessionsPerDay: number;
  avgBreaksPerDay: number;
}

export interface BarChartData {
  labels: string[];
  values: number[];
  average?: number;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterSlotsByRange(slots: HourlySlotMap, days: number): HourlySlotMap {
  const now = new Date();
  const todayStr = localDateStr(now);

  if (days === 0) {
    const filtered: HourlySlotMap = {};
    for (const [key, val] of Object.entries(slots)) {
      if (key.substring(0, 10) === todayStr) {
        filtered[key] = val;
      }
    }
    return filtered;
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = localDateStr(cutoff);

  const filtered: HourlySlotMap = {};
  for (const [key, val] of Object.entries(slots)) {
    if (key.substring(0, 10) >= cutoffStr) {
      filtered[key] = val;
    }
  }
  return filtered;
}

export function filterAggregatesByRange(aggregates: DailyAggregate[], days: number): DailyAggregate[] {
  if (days === 0) {
    const todayStr = localDateStr(new Date());
    return aggregates.filter((a) => a.date === todayStr);
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = localDateStr(cutoff);
  return aggregates.filter((a) => a.date >= cutoffStr);
}

export function calculateStats(slots: HourlySlotMap, days: number, aggregates: DailyAggregate[]): DashboardStats {
  const filtered = filterSlotsByRange(slots, days);

  const dayTotals: Record<string, number> = {};
  const hourTotals: Record<number, number> = {};

  for (const [key, val] of Object.entries(filtered)) {
    const datePart = key.substring(0, 10);
    const hour = parseInt(key.substring(11), 10);
    dayTotals[datePart] = (dayTotals[datePart] || 0) + val;
    hourTotals[hour] = (hourTotals[hour] || 0) + val;
  }

  const dayEntries = Object.entries(dayTotals);
  const totalMinutes = dayEntries.reduce((sum, [, v]) => sum + v, 0);
  const avgDailyMinutes = dayEntries.length > 0 ? Math.round(totalMinutes / dayEntries.length) : 0;

  let peakHour = 0;
  let peakVal = 0;
  for (const [h, v] of Object.entries(hourTotals)) {
    if (v > peakVal) {
      peakVal = v;
      peakHour = parseInt(h, 10);
    }
  }

  const filteredAggs = filterAggregatesByRange(aggregates, days);
  const aggCount = filteredAggs.length || 1;
  const totalSessions = filteredAggs.reduce((sum, a) => sum + a.sessionCount, 0);
  const totalBreaks = filteredAggs.reduce((sum, a) => sum + a.breakCount, 0);

  return {
    avgDailyMinutes,
    peakHour,
    avgSessionsPerDay: Math.round(totalSessions / aggCount),
    avgBreaksPerDay: Math.round(totalBreaks / aggCount),
  };
}

export function calculateTodaySessionStats(
  sessions: ScreenSession[],
  currentSession: ScreenSession | null,
): { sessionCount: number; breakCount: number } {
  const todayStr = localDateStr(new Date());

  let sessionCount = 0;
  for (const s of sessions) {
    if (s.type !== 'active') continue;
    const d = new Date(s.start);
    if (localDateStr(d) === todayStr) {
      sessionCount++;
    }
  }

  if (currentSession && currentSession.end === null && currentSession.type === 'active') {
    const d = new Date(currentSession.start);
    if (localDateStr(d) === todayStr) {
      sessionCount++;
    }
  }

  return {
    sessionCount,
    breakCount: Math.max(0, sessionCount - 1),
  };
}

export function transformForBarChart(slots: HourlySlotMap): BarChartData {
  const entries = Object.entries(slots)
    .map(([key, val]) => ({ hour: parseInt(key.substring(11), 10), val }))
    .sort((a, b) => a.hour - b.hour);

  return {
    labels: entries.map((e) => String(e.hour)),
    values: entries.map((e) => e.val),
  };
}

export function transformForDailyBarChart(slots: HourlySlotMap): BarChartData {
  const dayTotals: Record<string, number> = {};
  for (const [key, val] of Object.entries(slots)) {
    const datePart = key.substring(0, 10);
    dayTotals[datePart] = (dayTotals[datePart] || 0) + val;
  }

  const sorted = Object.entries(dayTotals).sort(([a], [b]) => a.localeCompare(b));
  const values = sorted.map(([, v]) => v);
  const average = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;

  return {
    labels: sorted.map(([d]) => d),
    values,
    average,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/screen-time/dashboard.test.ts --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/screen-time/dashboard-utils.ts tests/screen-time/dashboard.test.ts
git commit -m "feat(screen-time): rewrite dashboard-utils with bar chart transforms and session stats"
```

---

### Task 5: HTML & CSS — 4 Metric Cards + Chart Container

**Files:**
- Modify: `src/screen-time/dashboard.html`
- Modify: `src/screen-time/dashboard.css`

- [ ] **Step 1: Update dashboard.html**

Replace the 3-card `summary-cards` div with 4 cards. Replace `heatmap-container` with `chart-container`. Update the `daily-detail` section for drill-down:

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Screen Time Analytics</title>
  <link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Screen Time Analytics</h1>
      <div class="date-range-selector">
        <button class="range-btn active" data-range="0">Today</button>
        <button class="range-btn" data-range="7">7d</button>
        <button class="range-btn" data-range="30">30d</button>
        <button class="range-btn" data-range="90">90d</button>
      </div>
    </header>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card__label" id="label-time">Total on-screen</div>
        <div class="summary-card__value" id="stat-time">--</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Peak hour</div>
        <div class="summary-card__value" id="stat-peak">--</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label" id="label-sessions">Sessions</div>
        <div class="summary-card__value" id="stat-sessions">--</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label" id="label-breaks">Breaks</div>
        <div class="summary-card__value" id="stat-breaks">--</div>
      </div>
    </div>

    <div class="chart-container">
      <canvas id="chart-canvas"></canvas>
    </div>

    <div class="drill-down hidden" id="drill-down">
      <div class="drill-down__header">
        <h2 id="drill-down-date"></h2>
        <span class="drill-down__summary" id="drill-down-summary"></span>
      </div>
      <canvas id="drill-down-canvas"></canvas>
    </div>
  </div>

  <script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update dashboard.css**

Change `.summary-cards` grid to 4 columns. Rename `.heatmap-container` to `.chart-container`. Add drill-down styles. Remove old `#heatmap-canvas` rule:

Replace the `.summary-cards` rule:
```css
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
```

Replace `.heatmap-container` and `#heatmap-canvas` with:
```css
.chart-container {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 24px;
}

#chart-canvas {
  width: 100%;
  height: 300px;
}
```

Replace `.daily-detail`, `.daily-detail h2`, and `.detail-bar` with:
```css
.drill-down {
  background: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 24px;
}

.drill-down__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.drill-down__header h2 {
  font-size: 16px;
  font-weight: 700;
}

.drill-down__summary {
  font-size: 13px;
  color: var(--color-text-secondary);
}

#drill-down-canvas {
  width: 100%;
  height: 200px;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (dashboard.ts will have import errors but HTML/CSS are static assets copied by CopyPlugin)

- [ ] **Step 4: Commit**

```bash
git add src/screen-time/dashboard.html src/screen-time/dashboard.css
git commit -m "feat(screen-time): update HTML/CSS for 4 metric cards and bar chart layout"
```

---

### Task 6: Dashboard — Bar Charts + Drill-down

**Files:**
- Modify: `src/screen-time/dashboard.ts`

- [ ] **Step 1: Rewrite dashboard.ts**

Replace the entire file. Key changes:
- Remove `chartjs-chart-matrix` import
- Import new utils: `calculateStats`, `calculateTodaySessionStats`, `filterSlotsByRange`, `transformForBarChart`, `transformForDailyBarChart`
- `renderStats` handles 4 cards with different labels for Today vs multi-day
- `renderChart` renders hourly bar chart (Today) or daily bar chart (multi-day)
- Add click handler on daily bar chart to show drill-down panel

```typescript
import { Chart, registerables } from 'chart.js';
import { getScreenTimeState } from './storage';
import { ScreenTimeState } from './types';
import {
  calculateStats,
  calculateTodaySessionStats,
  filterSlotsByRange,
  transformForBarChart,
  transformForDailyBarChart,
  filterAggregatesByRange,
} from './dashboard-utils';

Chart.register(...registerables);

document.addEventListener('DOMContentLoaded', () => initDashboard());

let currentRange = 0;
let mainChart: Chart | null = null;
let drillChart: Chart | null = null;

async function initDashboard(): Promise<void> {
  const state = await getScreenTimeState();
  renderStats(state, currentRange);
  renderChart(state, currentRange);
  bindRangeButtons();
}

function renderStats(state: ScreenTimeState, days: number): void {
  const stats = calculateStats(state.hourlySlots, days, state.dailyAggregates);

  const timeEl = document.getElementById('stat-time');
  const timeLabel = document.getElementById('label-time');
  const peakEl = document.getElementById('stat-peak');
  const sessionsEl = document.getElementById('stat-sessions');
  const sessionsLabel = document.getElementById('label-sessions');
  const breaksEl = document.getElementById('stat-breaks');
  const breaksLabel = document.getElementById('label-breaks');

  const h = Math.floor(stats.avgDailyMinutes / 60);
  const m = stats.avgDailyMinutes % 60;

  if (timeEl) timeEl.textContent = `${h}h ${m}m`;
  if (timeLabel) timeLabel.textContent = days === 0 ? 'Total on-screen' : 'Avg on-screen/day';
  if (peakEl) peakEl.textContent = `${stats.peakHour}:00`;

  if (days === 0) {
    const todayStats = calculateTodaySessionStats(state.sessions, state.currentSession);
    if (sessionsEl) sessionsEl.textContent = String(todayStats.sessionCount);
    if (breaksEl) breaksEl.textContent = String(todayStats.breakCount);
    if (sessionsLabel) sessionsLabel.textContent = 'Sessions';
    if (breaksLabel) breaksLabel.textContent = 'Breaks';
  } else {
    if (sessionsEl) sessionsEl.textContent = String(stats.avgSessionsPerDay);
    if (breaksEl) breaksEl.textContent = String(stats.avgBreaksPerDay);
    if (sessionsLabel) sessionsLabel.textContent = 'Avg sessions/day';
    if (breaksLabel) breaksLabel.textContent = 'Avg breaks/day';
  }
}

function renderChart(state: ScreenTimeState, days: number): void {
  const canvas = document.getElementById('chart-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  if (mainChart) mainChart.destroy();
  hideDrillDown();

  const filtered = filterSlotsByRange(state.hourlySlots, days);

  if (days === 0) {
    renderHourlyBarChart(canvas, filtered);
  } else {
    renderDailyBarChart(canvas, filtered, state, days);
  }
}

function renderHourlyBarChart(canvas: HTMLCanvasElement, slots: HourlySlotMap): void {
  const data = transformForBarChart(slots);

  mainChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: data.values.map((v) =>
          v >= 30 ? 'rgba(76, 175, 80, 0.9)' : 'rgba(200, 230, 201, 0.9)'
        ),
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 60, ticks: { stepSize: 15 } },
        x: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} min active`,
          },
        },
      },
    },
  });
}

function renderDailyBarChart(
  canvas: HTMLCanvasElement,
  slots: HourlySlotMap,
  state: ScreenTimeState,
  days: number,
): void {
  const data = transformForDailyBarChart(slots);
  const avg = data.average || 0;

  mainChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const mins = ctx.parsed.y;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return `${h}h ${m}m active`;
            },
          },
        },
        annotation: undefined,
      },
      onClick: (_event, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const dateStr = data.labels[idx];
          showDrillDown(dateStr, state, days);
        }
      },
    },
    plugins: [{
      id: 'avgLine',
      afterDraw: (chart) => {
        if (avg <= 0) return;
        const yScale = chart.scales.y;
        const y = yScale.getPixelForValue(avg);
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.stroke();
        // label
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('avg', chart.chartArea.right, y - 4);
        ctx.restore();
      },
    }],
  });
}

function showDrillDown(dateStr: string, state: ScreenTimeState, days: number): void {
  const panel = document.getElementById('drill-down');
  const dateEl = document.getElementById('drill-down-date');
  const summaryEl = document.getElementById('drill-down-summary');
  const canvas = document.getElementById('drill-down-canvas') as HTMLCanvasElement;
  if (!panel || !dateEl || !summaryEl || !canvas) return;

  panel.classList.remove('hidden');
  dateEl.textContent = dateStr;

  // Get hourly slots for this date
  const dateSlots: HourlySlotMap = {};
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    if (key.substring(0, 10) === dateStr) {
      dateSlots[key] = val;
    }
  }

  // Get session/break info
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let sessionCount = 0;
  let breakCount = 0;

  if (dateStr === todayStr) {
    const todayStats = calculateTodaySessionStats(state.sessions, state.currentSession);
    sessionCount = todayStats.sessionCount;
    breakCount = todayStats.breakCount;
  } else {
    const agg = state.dailyAggregates.find((a) => a.date === dateStr);
    if (agg) {
      sessionCount = agg.sessionCount;
      breakCount = agg.breakCount;
    }
  }

  const totalMin = Object.values(dateSlots).reduce((s, v) => s + v, 0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  summaryEl.textContent = `${h}h ${m}m · ${sessionCount} sessions · ${breakCount} breaks`;

  // Render hourly bar chart for this date
  if (drillChart) drillChart.destroy();
  const data = transformForBarChart(dateSlots);

  drillChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: data.values.map((v) =>
          v >= 30 ? 'rgba(76, 175, 80, 0.9)' : 'rgba(200, 230, 201, 0.9)'
        ),
        borderRadius: 4,
        maxBarThickness: 30,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 60, ticks: { stepSize: 15 } },
        x: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function hideDrillDown(): void {
  const panel = document.getElementById('drill-down');
  if (panel) panel.classList.add('hidden');
  if (drillChart) {
    drillChart.destroy();
    drillChart = null;
  }
}

function bindRangeButtons(): void {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = parseInt(btn.getAttribute('data-range') || '0', 10);
      const freshState = await getScreenTimeState();
      renderStats(freshState, currentRange);
      renderChart(freshState, currentRange);
    });
  });
}
```

Note: `HourlySlotMap` import is used inside the function bodies via the imported utils. Add it to the import from `./types` if TypeScript requires it for the local type annotation in `showDrillDown` and `renderHourlyBarChart`:

```typescript
import { ScreenTimeState, HourlySlotMap } from './types';
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Commit**

```bash
git add src/screen-time/dashboard.ts
git commit -m "feat(screen-time): replace heatmap with hourly/daily bar charts and drill-down"
```

---

### Task 7: Remove chartjs-chart-matrix Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall the dependency**

Run: `npm uninstall chartjs-chart-matrix`

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove chartjs-chart-matrix dependency"
```

---

### Task 8: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds, `dist/` contains updated dashboard files

- [ ] **Step 3: Verify dist output contains updated files**

Run: `ls dist/screen-time/`
Expected: `dashboard.js`, `dashboard.html`, `dashboard.css`

- [ ] **Step 4: Commit any remaining changes**

If clean, no commit needed. Otherwise commit and note what was fixed.
