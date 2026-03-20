import { formatTime, formatRemaining, calculateProgress, applyManualCheckIn, checkInNow, isNotificationGranted } from '../../src/popup/popup';
import { createDefaultAppState, AppState } from '../../src/utils/types';

describe('popup helpers', () => {
  describe('formatTime', () => {
    it('formats timestamp to HH:mm', () => {
      const ts = new Date('2026-03-16T08:26:00').getTime();
      expect(formatTime(ts)).toBe('08:26');
    });

    it('formats afternoon time', () => {
      const ts = new Date('2026-03-16T17:05:00').getTime();
      expect(formatTime(ts)).toBe('17:05');
    });
  });

  describe('formatRemaining', () => {
    it('returns hours and minutes', () => {
      const ms = 3 * 60 * 60 * 1000 + 25 * 60 * 1000; // 3h 25m
      expect(formatRemaining(ms)).toBe('3h 25m');
    });

    it('returns 0h 0m for zero or negative', () => {
      expect(formatRemaining(0)).toBe('0h 0m');
      expect(formatRemaining(-1000)).toBe('0h 0m');
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 at check-in time', () => {
      const checkIn = 1000;
      const checkout = 2000;
      expect(calculateProgress(checkIn, checkout, checkIn)).toBe(0);
    });

    it('returns 100 at checkout time', () => {
      const checkIn = 1000;
      const checkout = 2000;
      expect(calculateProgress(checkIn, checkout, checkout)).toBe(100);
    });

    it('returns 50 at midpoint', () => {
      const checkIn = 1000;
      const checkout = 3000;
      expect(calculateProgress(checkIn, checkout, 2000)).toBe(50);
    });

    it('caps at 100', () => {
      expect(calculateProgress(1000, 2000, 5000)).toBe(100);
    });
  });
});

describe('applyManualCheckIn', () => {
  it('creates a new check-in when state.today is null', () => {
    const state = createDefaultAppState();
    const checkInTime = new Date('2026-03-16T08:25:00').getTime();

    const result = applyManualCheckIn(state, checkInTime);

    expect(result.today).not.toBeNull();
    expect(result.today!.checkInTime).toBe(checkInTime);
    expect(result.today!.manualOverride).toBe(true);
    expect(result.today!.date).toBe('2026-03-16');
    expect(result.today!.expectedCheckoutTime).toBeGreaterThan(checkInTime);
  });

  it('updates existing check-in when state.today exists', () => {
    const state = createDefaultAppState();
    state.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    const newCheckInTime = new Date('2026-03-16T08:25:00').getTime();

    const result = applyManualCheckIn(state, newCheckInTime);

    expect(result.today!.checkInTime).toBe(newCheckInTime);
    expect(result.today!.manualOverride).toBe(true);
  });

  it('recalculates expectedCheckoutTime with settings', () => {
    const state = createDefaultAppState();
    state.settings.lunchBreakMinutes = 90;
    const checkInTime = new Date('2026-03-16T08:00:00').getTime();

    const result = applyManualCheckIn(state, checkInTime);

    const expected = checkInTime + (8 * 60 + 90) * 60 * 1000;
    expect(result.today!.expectedCheckoutTime).toBe(expected);
  });
});

describe('checkInNow', () => {
  it('creates check-in record with current time when state.today is null', () => {
    const state = createDefaultAppState();
    const before = Date.now();
    const result = checkInNow(state);
    const after = Date.now();

    expect(result.today).not.toBeNull();
    expect(result.today!.checkInTime).toBeGreaterThanOrEqual(before);
    expect(result.today!.checkInTime).toBeLessThanOrEqual(after);
    expect(result.today!.manualOverride).toBe(false);
  });

  it('does not overwrite existing check-in', () => {
    const state = createDefaultAppState();
    const existingTime = new Date('2026-03-18T08:00:00').getTime();
    state.today = {
      date: '2026-03-18',
      checkInTime: existingTime,
      expectedCheckoutTime: existingTime + 9 * 60 * 60 * 1000,
      manualOverride: false,
    };

    const result = checkInNow(state);
    expect(result.today!.checkInTime).toBe(existingTime);
  });
});

describe('isNotificationGranted', () => {
  it('returns true for granted', () => {
    expect(isNotificationGranted('granted')).toBe(true);
  });

  it('returns false for denied', () => {
    expect(isNotificationGranted('denied')).toBe(false);
  });

  it('returns false for any other string', () => {
    expect(isNotificationGranted('unknown')).toBe(false);
  });
});
