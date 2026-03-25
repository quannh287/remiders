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
