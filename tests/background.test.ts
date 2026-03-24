import { handleActiveState, isWithinWorkHours } from '../src/background';
import { AppState, createDefaultAppState, DEFAULT_SETTINGS } from '../src/utils/types';

let mockState: AppState;

// Mock chrome APIs
(global as any).chrome = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({ appState: mockState })),
      set: jest.fn((items: Record<string, unknown>) => {
        mockState = items['appState'] as AppState;
        return Promise.resolve();
      }),
    },
  },
  idle: {
    setDetectionInterval: jest.fn(),
    onStateChanged: { addListener: jest.fn() },
    queryState: jest.fn(() => Promise.resolve('active')),
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve(null)),
    onAlarm: { addListener: jest.fn() },
  },
  notifications: {
    create: jest.fn(),
    getPermissionLevel: jest.fn(() => Promise.resolve('granted')),
  },
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn(),
  },
};

beforeEach(() => {
  mockState = createDefaultAppState();
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('handleActiveState', () => {
  it('creates check-in when today is null (first install)', async () => {
    jest.setSystemTime(new Date('2026-03-16T08:26:00'));
    await handleActiveState();
    expect(mockState.today).not.toBeNull();
    expect(mockState.today!.date).toBe('2026-03-16');
    expect(mockState.today!.manualOverride).toBe(false);
  });

  it('creates new check-in when date changes', async () => {
    jest.setSystemTime(new Date('2026-03-17T08:30:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T17:30:00').getTime();

    await handleActiveState();

    expect(mockState.today!.date).toBe('2026-03-17');
    expect(mockState.history).toHaveLength(1);
    expect(mockState.history[0].date).toBe('2026-03-16');
  });

  it('does not overwrite check-in on same day', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    const originalCheckIn = new Date('2026-03-16T08:26:00').getTime();
    mockState.today = {
      date: '2026-03-16',
      checkInTime: originalCheckIn,
      expectedCheckoutTime: originalCheckIn + (8 * 60 + 60) * 60 * 1000,
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:55:00').getTime();

    await handleActiveState();

    expect(mockState.today!.checkInTime).toBe(originalCheckIn);
  });

  it('creates alarm when creating new check-in', async () => {
    jest.setSystemTime(new Date('2026-03-16T08:00:00'));
    await handleActiveState();
    expect(chrome.alarms.create).toHaveBeenCalledWith('checkout-reminder', {
      when: mockState.today!.expectedCheckoutTime - DEFAULT_SETTINGS.notifyBeforeMinutes * 60000,
    });
  });

  it('does not overwrite manual override on same day', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    const manualTime = new Date('2026-03-16T08:00:00').getTime();
    mockState.today = {
      date: '2026-03-16',
      checkInTime: manualTime,
      expectedCheckoutTime: manualTime + (8 * 60 + 60) * 60 * 1000,
      manualOverride: true,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:00:00').getTime();

    await handleActiveState();

    expect(mockState.today!.checkInTime).toBe(manualTime);
    expect(mockState.today!.manualOverride).toBe(true);
  });

  it('trims history to 90 entries', async () => {
    jest.setSystemTime(new Date('2026-06-16T08:00:00'));
    mockState.history = Array.from({ length: 90 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      checkInTime: 1000 * i,
      expectedCheckoutTime: 2000 * i,
      manualOverride: false,
    }));
    mockState.today = {
      date: '2026-06-15',
      checkInTime: 1000,
      expectedCheckoutTime: 2000,
      manualOverride: false,
    };

    await handleActiveState();

    expect(mockState.history.length).toBeLessThanOrEqual(90);
  });

  it('updates lastActiveTimestamp on every active event', async () => {
    jest.setSystemTime(new Date('2026-03-16T10:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    mockState.lastActiveTimestamp = new Date('2026-03-16T09:55:00').getTime();

    await handleActiveState();

    expect(mockState.lastActiveTimestamp).toBe(new Date('2026-03-16T10:00:00').getTime());
  });

  it('does not auto check-in outside work hours (before 6:00)', async () => {
    jest.setSystemTime(new Date('2026-03-18T05:30:00'));
    await handleActiveState();
    expect(mockState.today).toBeNull();
  });

  it('does not auto check-in outside work hours (after 11:00)', async () => {
    jest.setSystemTime(new Date('2026-03-18T14:00:00'));
    await handleActiveState();
    expect(mockState.today).toBeNull();
  });

  it('still updates lastActiveTimestamp outside work hours when record exists', async () => {
    jest.setSystemTime(new Date('2026-03-18T14:00:00'));
    mockState.today = {
      date: '2026-03-18',
      checkInTime: new Date('2026-03-18T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-18T17:00:00').getTime(),
      manualOverride: false,
    };
    await handleActiveState();
    expect(mockState.lastActiveTimestamp).toBe(new Date('2026-03-18T14:00:00').getTime());
  });
});

describe('verifyAlarmExists', () => {
  it('recreates alarm if today has check-in but alarm is missing', async () => {
    jest.setSystemTime(new Date('2026-03-16T12:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    (chrome.alarms.get as jest.Mock).mockResolvedValueOnce(null);

    const { verifyAlarmExists } = require('../src/background');
    await verifyAlarmExists();

    expect(chrome.alarms.create).toHaveBeenCalledWith('checkout-reminder', {
      when: mockState.today!.expectedCheckoutTime - DEFAULT_SETTINGS.notifyBeforeMinutes * 60000,
    });
  });

  it('does not recreate alarm if alarm already exists', async () => {
    jest.setSystemTime(new Date('2026-03-16T12:00:00'));
    mockState.today = {
      date: '2026-03-16',
      checkInTime: new Date('2026-03-16T08:00:00').getTime(),
      expectedCheckoutTime: new Date('2026-03-16T17:00:00').getTime(),
      manualOverride: false,
    };
    (chrome.alarms.get as jest.Mock).mockResolvedValueOnce({ name: 'checkout-reminder' });

    const { verifyAlarmExists } = require('../src/background');
    await verifyAlarmExists();

    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

describe('handleCheckoutAlarm', () => {
  it('creates notification when permission is granted', async () => {
    mockState.settings.notifyBeforeMinutes = 15;
    (chrome.notifications.getPermissionLevel as jest.Mock).mockResolvedValueOnce('granted');

    const { handleCheckoutAlarm } = require('../src/background');
    await handleCheckoutAlarm();

    expect(chrome.notifications.create).toHaveBeenCalledWith('checkout-notify', expect.objectContaining({
      type: 'basic',
      title: 'Work Timer',
    }));
  });

  it('does not create notification when permission is denied', async () => {
    (chrome.notifications.getPermissionLevel as jest.Mock).mockResolvedValueOnce('denied');

    const { handleCheckoutAlarm } = require('../src/background');
    await handleCheckoutAlarm();

    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});

describe('isWithinWorkHours', () => {
  it('returns true at 6:00', () => {
    jest.setSystemTime(new Date('2026-03-18T06:00:00'));
    expect(isWithinWorkHours()).toBe(true);
  });

  it('returns true at 10:59', () => {
    jest.setSystemTime(new Date('2026-03-18T10:59:00'));
    expect(isWithinWorkHours()).toBe(true);
  });

  it('returns false at 11:00', () => {
    jest.setSystemTime(new Date('2026-03-18T11:00:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns false at 5:59', () => {
    jest.setSystemTime(new Date('2026-03-18T05:59:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns false at 2:00 (late night)', () => {
    jest.setSystemTime(new Date('2026-03-18T02:00:00'));
    expect(isWithinWorkHours()).toBe(false);
  });

  it('returns true at 8:30 (typical morning)', () => {
    jest.setSystemTime(new Date('2026-03-18T08:30:00'));
    expect(isWithinWorkHours()).toBe(true);
  });
});
