# Screen Time Dashboard Redesign

## Problem

The current Screen Time Analytics dashboard is hard to read and provides little insight:

1. **Heatmap is mostly empty** — Y-axis shows 0–23 hours but only 2-3 have data, leaving 90% whitespace
2. **Metrics are not useful** — "Peak hour" shows just "11:00" with no context; "View" card shows "--" for Today
3. **No actionable insights** — No visibility into work patterns, breaks, or session counts

## Design

### Chart Types

**Today view:** Hourly Bar Chart
- X-axis: hours of the day (only hours with data)
- Y-axis: active minutes (0–60)
- Each bar represents minutes of active screen time in that hour
- Tooltip on hover showing exact minutes

**Multi-day view (7d/30d/90d):** Daily Bar Chart with drill-down
- X-axis: dates
- Y-axis: total active minutes per day
- Dashed horizontal line showing the average
- Click a bar to expand an hourly breakdown below the chart
- Drill-down panel shows: date, total time, session count, break count, and an hourly bar chart for that day

### Metric Cards (4 cards)

**Today view:**
| Card | Label | Value example | Source |
|------|-------|---------------|--------|
| 1 | Total on-screen | 3h 42m | hourly slots for today |
| 2 | Peak hour | 10:00 | hourly slots for today |
| 3 | Sessions | 6 | count active sessions from `sessions[]` array for today (always within 7-day retention) + 1 if `currentSession` is open |
| 4 | Breaks | 5 | `sessionCount - 1` (capped at 0) — a break is a gap between two active sessions |

**Multi-day view (7d/30d/90d):**
| Card | Label | Value example | Source |
|------|-------|---------------|--------|
| 1 | Avg on-screen/day | 4h 15m | hourly slots (same as current `calculateStats`) |
| 2 | Peak hour | 10:00 | hourly slots |
| 3 | Avg sessions/day | 5.3 | `dailyAggregates` |
| 4 | Avg breaks/day | 4.3 | `dailyAggregates` |

**Drill-down panel** (multi-day view, on click): reads session/break counts from `dailyAggregates` for the selected date. If the selected date is today, uses live computation from `sessions[]` (same as Today view).

### Data Model Changes

Add `DailyAggregate` to support sessions/breaks metrics beyond the 7-day session retention window:

```typescript
interface DailyAggregate {
  date: string;           // "YYYY-MM-DD"
  totalMinutes: number;
  sessionCount: number;
  breakCount: number;
}
```

Add `dailyAggregates: DailyAggregate[]` to `ScreenTimeState`. Bump `schemaVersion` from 1 to 2.

**Definitions:**
- `sessionCount` counts only **active** sessions (type `'active'`). Idle/locked sessions are not counted.
- `breakCount` = `sessionCount - 1` (capped at 0). A "break" is defined as a gap (idle or locked period) between two consecutive active sessions in the same day.

**When to update:** Each time an active session ends (in `handleScreenTimeStateChange` when transitioning away from active), upsert the daily aggregate for that date — increment `sessionCount`, recompute `totalMinutes` from hourly slots for that date, and derive `breakCount` as `sessionCount - 1` (capped at 0).

**Retention:** Trim daily aggregates at the same 90-day cutoff as hourly slots (in `trimOldData`).

**Migration:** On load, if `schemaVersion < 2` and `dailyAggregates` is missing, initialize it as `[]`. Backfill `totalMinutes` from existing hourly slots for all dates present. `sessionCount`/`breakCount` cannot be recovered for dates older than 7 days (sessions already trimmed), so set them to `0` for those dates. For dates within the 7-day session window, compute from the `sessions[]` array.

**Note:** The `DashboardStats.todayVsAvgPercent` field is removed as the 3rd metric card is replaced by Sessions. The average line on the multi-day bar chart does not appear on the Today hourly chart.

### Chart Library

Continue using Chart.js. Replace the matrix/heatmap chart with a standard `bar` chart. Remove `chartjs-chart-matrix` dependency.

### Files to Change

- `src/screen-time/types.ts` — Add `DailyAggregate`, update `ScreenTimeState`
- `src/screen-time/tracker.ts` — Upsert daily aggregates on session end, trim them
- `src/screen-time/dashboard-utils.ts` — Replace `transformForHeatmap` with new stat calculations (sessions, breaks from aggregates), add drill-down data transform
- `src/screen-time/dashboard.ts` — Replace heatmap with bar chart, add drill-down click handler, update metric card rendering for 4 cards
- `src/screen-time/dashboard.html` — Add 4th metric card, remove matrix canvas setup
- `src/screen-time/dashboard.css` — Update grid to 4 columns, add drill-down panel styles
- `tests/screen-time/dashboard.test.ts` — Update tests for new stats and chart data
- `package.json` / `webpack.config.js` — Remove `chartjs-chart-matrix` dependency
