// Minimal chrome stub so background.ts can be imported without errors.
// Tests override specific methods as needed.
(global as any).chrome = {
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
    },
  },
  idle: {
    setDetectionInterval: () => {},
    onStateChanged: { addListener: () => {} },
  },
  alarms: {
    create: () => {},
    clear: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    onAlarm: { addListener: () => {} },
  },
  notifications: {
    create: () => {},
    getPermissionLevel: () => Promise.resolve('granted'),
  },
  runtime: {
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    onMessage: { addListener: () => {} },
    getURL: (path: string) => `chrome-extension://test/${path}`,
    sendMessage: () => Promise.resolve(),
  },
  tabs: {
    create: () => Promise.resolve({}),
  },
};
