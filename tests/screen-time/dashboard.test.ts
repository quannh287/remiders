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
      expect(data.labels).toEqual(['9:00', '14:00']);
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
