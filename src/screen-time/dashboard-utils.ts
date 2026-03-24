import { HourlySlotMap } from './types';

export interface DashboardStats {
  avgDailyMinutes: number;
  peakHour: number;
  todayVsAvgPercent: number;
}

export interface HeatmapPoint {
  x: string;
  y: number;
  v: number;
}

export function filterSlotsByRange(slots: HourlySlotMap, days: number): HourlySlotMap {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const filtered: HourlySlotMap = {};
  for (const [key, val] of Object.entries(slots)) {
    const datePart = key.substring(0, 10);
    if (datePart >= cutoffStr) {
      filtered[key] = val;
    }
  }
  return filtered;
}

export function calculateStats(slots: HourlySlotMap, days: number): DashboardStats {
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

  const todayStr = new Date().toISOString().substring(0, 10);
  const todayTotal = dayTotals[todayStr] || 0;
  const otherDays = dayEntries.filter(([d]) => d !== todayStr);
  const otherAvg = otherDays.length > 0
    ? otherDays.reduce((sum, [, v]) => sum + v, 0) / otherDays.length
    : 0;
  const todayVsAvgPercent = otherAvg > 0
    ? Math.round(((todayTotal - otherAvg) / otherAvg) * 100)
    : 0;

  return { avgDailyMinutes, peakHour, todayVsAvgPercent };
}

export function transformForHeatmap(slots: HourlySlotMap): HeatmapPoint[] {
  return Object.entries(slots).map(([key, val]) => ({
    x: key.substring(0, 10),
    y: parseInt(key.substring(11), 10),
    v: val,
  }));
}
