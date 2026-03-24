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

// Local-time date string matching formatSlotKey's YYYY-MM-DD format
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterSlotsByRange(slots: HourlySlotMap, days: number): HourlySlotMap {
  const now = new Date();
  const todayStr = localDateStr(now);

  // days === 0 means "today only"
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

  // String comparison works because YYYY-MM-DD is lexicographically sortable
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

  const todayStr = localDateStr(new Date());
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
