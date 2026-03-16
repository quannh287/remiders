import { formatTime, formatRemaining, calculateProgress } from '../../src/popup/popup';

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
