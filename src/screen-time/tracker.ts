import { HourlySlotMap, ScreenSession } from './types';

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
