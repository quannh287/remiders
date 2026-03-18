export interface CheckInRecord {
  date: string;
  checkInTime: number;
  expectedCheckoutTime: number;
  manualOverride: boolean;
}

export interface Settings {
  lunchBreakMinutes: number;
  notifyBeforeMinutes: number;
}

export interface AppState {
  today: CheckInRecord | null;
  history: CheckInRecord[];
  settings: Settings;
  lastActiveTimestamp: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lunchBreakMinutes: 60,
  notifyBeforeMinutes: 15,
};

export const AUTO_CHECKIN_HOUR_START = 6;
export const AUTO_CHECKIN_HOUR_END = 11;

export function calculateCheckoutTime(checkInTime: number, lunchBreakMinutes: number): number {
  return checkInTime + (8 * 60 + lunchBreakMinutes) * 60 * 1000;
}

function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createCheckInRecord(checkInTime: number, lunchBreakMinutes: number): CheckInRecord {
  const dateStr = formatDateLocal(new Date(checkInTime));
  return {
    date: dateStr,
    checkInTime,
    expectedCheckoutTime: calculateCheckoutTime(checkInTime, lunchBreakMinutes),
    manualOverride: false,
  };
}

export function todayDateString(): string {
  return formatDateLocal(new Date());
}

export function createDefaultAppState(): AppState {
  return {
    today: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    lastActiveTimestamp: 0,
  };
}
