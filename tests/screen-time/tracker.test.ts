import { aggregateToHourlySlots } from '../../src/screen-time/tracker';
import { HourlySlotMap, ScreenSession } from '../../src/screen-time/types';

describe('aggregateToHourlySlots', () => {
  it('adds minutes to a single hourly slot', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:10:00').getTime(),
      end: new Date('2026-03-23T14:40:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-14']).toBe(30);
  });

  it('splits session across hour boundaries', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T09:30:00').getTime(),
      end: new Date('2026-03-23T11:15:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-09']).toBe(30);
    expect(slots['2026-03-23-10']).toBe(60);
    expect(slots['2026-03-23-11']).toBe(15);
  });

  it('caps each slot at 60 minutes', () => {
    const slots: HourlySlotMap = { '2026-03-23-14': 50 };
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:00:00').getTime(),
      end: new Date('2026-03-23T14:30:00').getTime(),
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(slots['2026-03-23-14']).toBe(60);
  });

  it('handles session with null end (skips)', () => {
    const slots: HourlySlotMap = {};
    const session: ScreenSession = {
      start: new Date('2026-03-23T14:10:00').getTime(),
      end: null,
      type: 'active',
    };
    aggregateToHourlySlots(session, slots);
    expect(Object.keys(slots)).toHaveLength(0);
  });
});
