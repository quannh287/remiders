import { DEFAULT_SETTINGS, createCheckInRecord, createDefaultAppState } from '../../src/utils/types';

describe('types', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('has lunchBreakMinutes of 60', () => {
      expect(DEFAULT_SETTINGS.lunchBreakMinutes).toBe(60);
    });

    it('has notifyBeforeMinutes of 15', () => {
      expect(DEFAULT_SETTINGS.notifyBeforeMinutes).toBe(15);
    });
  });

  describe('createCheckInRecord', () => {
    it('creates a record with given timestamp and correct date', () => {
      const timestamp = new Date('2026-03-16T08:26:00').getTime();
      const record = createCheckInRecord(timestamp, 60);
      expect(record.date).toBe('2026-03-16');
      expect(record.checkInTime).toBe(timestamp);
      expect(record.manualOverride).toBe(false);
    });

    it('calculates expectedCheckoutTime as checkIn + 8h + lunch', () => {
      const timestamp = new Date('2026-03-16T08:00:00').getTime();
      const record = createCheckInRecord(timestamp, 60);
      const expected = timestamp + (8 * 60 + 60) * 60 * 1000;
      expect(record.expectedCheckoutTime).toBe(expected);
    });

    it('calculates correctly with custom lunch break', () => {
      const timestamp = new Date('2026-03-16T08:00:00').getTime();
      const record = createCheckInRecord(timestamp, 90);
      const expected = timestamp + (8 * 60 + 90) * 60 * 1000;
      expect(record.expectedCheckoutTime).toBe(expected);
    });
  });

  describe('createDefaultAppState', () => {
    it('returns state with null today and empty history', () => {
      const state = createDefaultAppState();
      expect(state.today).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.lastActiveTimestamp).toBe(0);
    });
  });
});
