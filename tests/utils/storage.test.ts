import { getState, setState, updateSettings } from '../../src/utils/storage';
import { createDefaultAppState, DEFAULT_SETTINGS, AppState } from '../../src/utils/types';

// Mock chrome.storage.local
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

describe('storage', () => {
  describe('getState', () => {
    it('returns default state when storage is empty', async () => {
      const state = await getState();
      expect(state).toEqual(createDefaultAppState());
    });

    it('returns stored state when present', async () => {
      const stored: AppState = {
        today: { date: '2026-03-16', checkInTime: 1000, expectedCheckoutTime: 2000, manualOverride: false },
        history: [],
        settings: DEFAULT_SETTINGS,
        lastActiveTimestamp: 500,
      };
      mockStorage['appState'] = stored;
      const state = await getState();
      expect(state).toEqual(stored);
    });
  });

  describe('setState', () => {
    it('persists state to storage', async () => {
      const state = createDefaultAppState();
      state.lastActiveTimestamp = 12345;
      await setState(state);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ appState: state });
    });
  });

  describe('updateSettings', () => {
    it('merges new settings into existing state', async () => {
      const state = createDefaultAppState();
      mockStorage['appState'] = state;
      await updateSettings({ lunchBreakMinutes: 90 });
      const saved = mockStorage['appState'] as AppState;
      expect(saved.settings.lunchBreakMinutes).toBe(90);
      expect(saved.settings.notifyBeforeMinutes).toBe(15);
    });
  });
});
