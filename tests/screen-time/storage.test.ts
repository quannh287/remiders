import { getScreenTimeState, setScreenTimeState, updateScreenTimeSettings } from '../../src/screen-time/storage';
import { createDefaultScreenTimeState, ScreenTimeState } from '../../src/screen-time/types';

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

describe('screen-time storage', () => {
  describe('getScreenTimeState', () => {
    it('returns default state when storage is empty', async () => {
      const state = await getScreenTimeState();
      expect(state).toEqual(createDefaultScreenTimeState());
    });

    it('returns stored state when present', async () => {
      const stored: ScreenTimeState = {
        ...createDefaultScreenTimeState(),
        sessions: [{ start: 1000, end: 2000, type: 'active' }],
      };
      mockStorage['screenTimeState'] = stored;
      const state = await getScreenTimeState();
      expect(state).toEqual(stored);
    });
  });

  describe('setScreenTimeState', () => {
    it('persists state to storage', async () => {
      const state = createDefaultScreenTimeState();
      await setScreenTimeState(state);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ screenTimeState: state });
    });
  });

  describe('updateScreenTimeSettings', () => {
    it('merges new settings into existing state', async () => {
      mockStorage['screenTimeState'] = createDefaultScreenTimeState();
      await updateScreenTimeSettings({ idleThresholdMinutes: 10 });
      const saved = mockStorage['screenTimeState'] as ScreenTimeState;
      expect(saved.settings.idleThresholdMinutes).toBe(10);
    });
  });
});
