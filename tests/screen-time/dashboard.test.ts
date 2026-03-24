import { calculateStats, filterSlotsByRange, transformForHeatmap } from '../../src/screen-time/dashboard-utils';
import { HourlySlotMap } from '../../src/screen-time/types';

describe('dashboard stats', () => {
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
      expect(filtered['2026-03-22-09']).toBeUndefined();
    });
  });

  describe('calculateStats', () => {
    it('calculates average daily minutes', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 30,
        '2026-03-23-11': 30,
        '2026-03-22-10': 60,
      };
      const stats = calculateStats(slots, 7);
      expect(stats.avgDailyMinutes).toBe(60);
    });

    it('finds peak hour', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-14': 50,
        '2026-03-22-14': 55,
        '2026-03-23-10': 20,
      };
      const stats = calculateStats(slots, 7);
      expect(stats.peakHour).toBe(14);
    });

    it('calculates today vs average', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-10': 60,
        '2026-03-22-10': 30,
        '2026-03-21-10': 30,
      };
      const stats = calculateStats(slots, 7);
      expect(stats.todayVsAvgPercent).toBeGreaterThan(0);
    });
  });

  describe('transformForHeatmap', () => {
    it('transforms slots to chart.js matrix data', () => {
      const slots: HourlySlotMap = {
        '2026-03-23-14': 45,
      };
      const data = transformForHeatmap(slots);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({ x: '2026-03-23', y: 14, v: 45 });
    });
  });
});
