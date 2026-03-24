import { HourlySlotMap, ScreenSession, ScreenTimeState } from './types';

function formatSlotKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}-${h}`;
}

export function aggregateToHourlySlots(session: ScreenSession, slots: HourlySlotMap): void {
  if (session.end === null) return;

  let cursor = session.start;
  const end = session.end;

  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const hourEnd = new Date(cursorDate);
    hourEnd.setMinutes(0, 0, 0);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const sliceEnd = Math.min(hourEnd.getTime(), end);
    const minutes = Math.round((sliceEnd - cursor) / 60000);

    if (minutes > 0) {
      const key = formatSlotKey(cursorDate);
      slots[key] = Math.min(60, (slots[key] || 0) + minutes);
    }

    cursor = sliceEnd;
  }
}

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SLOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function trimOldData(state: ScreenTimeState): void {
  const now = Date.now();
  const sessionCutoff = now - SESSION_RETENTION_MS;
  state.sessions = state.sessions.filter((s) => s.start >= sessionCutoff);

  const slotCutoff = now - SLOT_RETENTION_MS;
  for (const key of Object.keys(state.hourlySlots)) {
    const datePart = key.substring(0, 10);
    const slotDate = new Date(datePart + 'T00:00:00').getTime();
    if (slotDate < slotCutoff) {
      delete state.hourlySlots[key];
    }
  }
}
