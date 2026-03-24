import { handleScreenTimeStateChange, recoverSession, getScreenTimeIdleThreshold } from '../../src/screen-time/tracker';
import { getScreenTimeState, setScreenTimeState } from '../../src/screen-time/storage';
import { createDefaultScreenTimeState, ScreenTimeState } from '../../src/screen-time/types';
import { getState as getAppState } from '../../src/utils/storage';

jest.mock('../../src/screen-time/storage');
jest.mock('../../src/utils/storage');

const mockGetScreenTimeState = getScreenTimeState as jest.MockedFunction<typeof getScreenTimeState>;
const mockSetScreenTimeState = setScreenTimeState as jest.MockedFunction<typeof setScreenTimeState>;
const mockGetAppState = getAppState as jest.MockedFunction<typeof getAppState>;

describe('handleScreenTimeStateChange', () => {
  let screenTimeState: ScreenTimeState;

  beforeEach(() => {
    jest.useFakeTimers();
    screenTimeState = createDefaultScreenTimeState();
    mockGetScreenTimeState.mockResolvedValue(screenTimeState);
    mockSetScreenTimeState.mockImplementation(async (s) => { screenTimeState = s; });
    mockGetAppState.mockResolvedValue({
      today: { date: '2026-03-23', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a new session on active state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:00:00'));
    await handleScreenTimeStateChange('active');
    expect(screenTimeState.currentSession).not.toBeNull();
    expect(screenTimeState.currentSession!.type).toBe('active');
    expect(screenTimeState.currentSession!.end).toBeNull();
  });

  it('closes session and aggregates on locked state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T09:30:00').getTime(),
      end: null,
      type: 'active',
    };
    await handleScreenTimeStateChange('locked');
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
    expect(screenTimeState.sessions[0].end).toBe(new Date('2026-03-23T10:00:00').getTime());
    expect(screenTimeState.hourlySlots['2026-03-23-09']).toBe(30);
    expect(screenTimeState.hourlySlots['2026-03-23-10']).toBeUndefined();
  });

  it('does nothing when not checked in', async () => {
    mockGetAppState.mockResolvedValue({
      today: null,
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: 0,
    });
    await handleScreenTimeStateChange('active');
    expect(screenTimeState.currentSession).toBeNull();
  });

  it('closes session on idle state', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:05:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    await handleScreenTimeStateChange('idle');
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
  });
});

describe('recoverSession', () => {
  let screenTimeState: ScreenTimeState;

  beforeEach(() => {
    jest.useFakeTimers();
    screenTimeState = createDefaultScreenTimeState();
    mockGetScreenTimeState.mockResolvedValue(screenTimeState);
    mockSetScreenTimeState.mockImplementation(async (s) => { screenTimeState = s; });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes orphaned session using lastActiveTimestamp', async () => {
    jest.setSystemTime(new Date('2026-03-23T14:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    const lastActive = new Date('2026-03-23T12:00:00').getTime();
    mockGetAppState.mockResolvedValue({
      today: { date: '2026-03-23', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: lastActive,
    });

    await recoverSession();
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(1);
    expect(screenTimeState.sessions[0].end).toBe(lastActive);
  });

  it('discards orphaned session if lastActiveTimestamp is from different day', async () => {
    jest.setSystemTime(new Date('2026-03-24T08:00:00'));
    screenTimeState.currentSession = {
      start: new Date('2026-03-23T10:00:00').getTime(),
      end: null,
      type: 'active',
    };
    mockGetAppState.mockResolvedValue({
      today: null,
      history: [],
      settings: { lunchBreakMinutes: 60, notifyBeforeMinutes: 15 },
      lastActiveTimestamp: new Date('2026-03-23T17:00:00').getTime(),
    });

    await recoverSession();
    expect(screenTimeState.currentSession).toBeNull();
    expect(screenTimeState.sessions).toHaveLength(0);
  });

  it('does nothing if no current session', async () => {
    await recoverSession();
    expect(screenTimeState.sessions).toHaveLength(0);
  });
});

describe('getScreenTimeIdleThreshold', () => {
  it('returns the configured idle threshold', async () => {
    const state = createDefaultScreenTimeState();
    state.settings.idleThresholdMinutes = 10;
    mockGetScreenTimeState.mockResolvedValue(state);
    const threshold = await getScreenTimeIdleThreshold();
    expect(threshold).toBe(10);
  });
});
