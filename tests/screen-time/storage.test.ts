import { getScreenTimeState, setScreenTimeState, updateScreenTimeSettings, migrateScreenTimeState } from '../../src/screen-time/storage';
import { createDefaultScreenTimeState, ScreenTimeState } from '../../src/screen-time/types';

const mockStorage: Record<string, unknown> = {};

(global as any).chrome = {
  storage: {
    local: {
      get: jest.fn((keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
};

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  jest.clearAllMocks();
});

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

describe('screen-time storage', () => {
  describe('getScreenTimeState', () => {
    it('returns default state when storage is empty', async () => {
      const state = await getScreenTimeState();
      expect(state).toEqual(createDefaultScreenTimeState());
    });

    it('returns stored state when present', async () => {
      const stored: ScreenTimeState = {
        ...createDefaultScreenTimeState(),
        sessions: [{ start: 1000, end: 2000, type: 'active' }],
      };
      mockStorage['screenTimeState'] = stored;
      const state = await getScreenTimeState();
      expect(state).toEqual(stored);
    });
  });

  describe('setScreenTimeState', () => {
    it('persists state to storage', async () => {
      const state = createDefaultScreenTimeState();
      await setScreenTimeState(state);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ screenTimeState: state });
    });
  });

  describe('updateScreenTimeSettings', () => {
    it('merges new settings into existing state', async () => {
      mockStorage['screenTimeState'] = createDefaultScreenTimeState();
      await updateScreenTimeSettings({ idleThresholdMinutes: 10 });
      const saved = mockStorage['screenTimeState'] as ScreenTimeState;
      expect(saved.settings.idleThresholdMinutes).toBe(10);
    });
  });
});
