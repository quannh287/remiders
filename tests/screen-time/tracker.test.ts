import { aggregateToHourlySlots, trimOldData, upsertDailyAggregate } from '../../src/screen-time/tracker';
import { HourlySlotMap, ScreenSession, createDefaultScreenTimeState } from '../../src/screen-time/types';

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

describe('upsertDailyAggregate', () => {
  it('creates new aggregate for a date', () => {
    const state = createDefaultScreenTimeState();
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-11': 30 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates).toHaveLength(1);
    expect(state.dailyAggregates[0]).toEqual({
      date: '2026-03-25',
      totalMinutes: 75,
      sessionCount: 1,
      breakCount: 0,
    });
  });

  it('increments sessionCount on existing aggregate', () => {
    const state = createDefaultScreenTimeState();
    state.dailyAggregates = [{ date: '2026-03-25', totalMinutes: 45, sessionCount: 1, breakCount: 0 }];
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-14': 30 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates[0].sessionCount).toBe(2);
    expect(state.dailyAggregates[0].breakCount).toBe(1);
    expect(state.dailyAggregates[0].totalMinutes).toBe(75);
  });

  it('recomputes totalMinutes from hourly slots', () => {
    const state = createDefaultScreenTimeState();
    state.dailyAggregates = [{ date: '2026-03-25', totalMinutes: 30, sessionCount: 1, breakCount: 0 }];
    state.hourlySlots = { '2026-03-25-10': 45, '2026-03-25-11': 60 };
    upsertDailyAggregate(state, '2026-03-25');
    expect(state.dailyAggregates[0].totalMinutes).toBe(105);
  });
});

describe('trimOldData', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('removes sessions older than 7 days', () => {
    jest.setSystemTime(new Date('2026-03-23T12:00:00'));
    const state = createDefaultScreenTimeState();
    state.sessions = [
      { start: new Date('2026-03-15T10:00:00').getTime(), end: new Date('2026-03-15T11:00:00').getTime(), type: 'active' },
      { start: new Date('2026-03-20T10:00:00').getTime(), end: new Date('2026-03-20T11:00:00').getTime(), type: 'active' },
    ];
    trimOldData(state);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].start).toBe(new Date('2026-03-20T10:00:00').getTime());
  });

  it('removes hourly slots older than 90 days', () => {
    jest.setSystemTime(new Date('2026-06-23T12:00:00'));
    const state = createDefaultScreenTimeState();
    state.hourlySlots = {
      '2026-03-01-10': 30,
      '2026-06-20-10': 45,
    };
    trimOldData(state);
    expect(state.hourlySlots['2026-03-01-10']).toBeUndefined();
    expect(state.hourlySlots['2026-06-20-10']).toBe(45);
  });
});
