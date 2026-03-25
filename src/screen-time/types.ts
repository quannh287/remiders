export interface ScreenSession {
  start: number;
  end: number | null;
  type: 'active' | 'locked' | 'idle';
}

export type HourlySlotMap = Record<string, number>;

export interface ScreenTimeSettings {
  idleThresholdMinutes: number;
}

export interface DailyAggregate {
  date: string;           // "YYYY-MM-DD"
  totalMinutes: number;
  sessionCount: number;
  breakCount: number;
}

export interface ScreenTimeState {
  sessions: ScreenSession[];
  hourlySlots: HourlySlotMap;
  currentSession: ScreenSession | null;
  settings: ScreenTimeSettings;
  schemaVersion: number;
  dailyAggregates: DailyAggregate[];
}

export const DEFAULT_SCREEN_TIME_SETTINGS: ScreenTimeSettings = {
  idleThresholdMinutes: 5,
};

export function createDefaultScreenTimeState(): ScreenTimeState {
  return {
    sessions: [],
    hourlySlots: {},
    currentSession: null,
    settings: { ...DEFAULT_SCREEN_TIME_SETTINGS },
    schemaVersion: 2,
    dailyAggregates: [],
  };
}
