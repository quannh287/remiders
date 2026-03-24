import { getScreenTimeState } from './storage';
import { HourlySlotMap } from './types';

function todayDatePrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayActiveMinutes(slots: HourlySlotMap): number {
  const prefix = todayDatePrefix();
  let total = 0;
  for (const [key, val] of Object.entries(slots)) {
    if (key.startsWith(prefix)) {
      total += val;
    }
  }
  return total;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export async function renderScreenTimeSummary(
  container: HTMLElement,
  checkInTime: number | null
): Promise<void> {
  const state = await getScreenTimeState();
  let activeMinutes = getTodayActiveMinutes(state.hourlySlots);

  const now = Date.now();

  // Include current open session (not yet aggregated to hourly slots)
  if (state.currentSession && state.currentSession.end === null) {
    activeMinutes += Math.round((now - state.currentSession.start) / 60000);
  }
  const totalMinutesSinceCheckIn = checkInTime
    ? Math.round((now - checkInTime) / 60000)
    : 0;
  const offMinutes = Math.max(0, totalMinutesSinceCheckIn - activeMinutes);

  const onEl = container.querySelector('#screen-time-on') as HTMLElement;
  const offEl = container.querySelector('#screen-time-off') as HTMLElement;
  if (onEl) onEl.textContent = formatDuration(activeMinutes);
  if (offEl) offEl.textContent = formatDuration(offMinutes);

  renderTimelineBar(container, state.hourlySlots, checkInTime);
}

function renderTimelineBar(
  container: HTMLElement,
  slots: HourlySlotMap,
  checkInTime: number | null,
): void {
  const bar = container.querySelector('#screen-time-bar') as HTMLElement;
  if (!bar || !checkInTime) return;

  bar.innerHTML = '';
  const now = Date.now();
  const totalMs = now - checkInTime;
  if (totalMs <= 0) return;

  const prefix = todayDatePrefix();
  const checkInHour = new Date(checkInTime).getHours();
  const currentHour = new Date(now).getHours();

  for (let h = checkInHour; h <= currentHour; h++) {
    const key = `${prefix}-${String(h).padStart(2, '0')}`;
    const minutes = slots[key] || 0;
    const intensity = Math.min(1, minutes / 60);

    const block = document.createElement('div');
    block.className = 'timeline-block';
    block.style.flex = '1';
    block.style.backgroundColor = intensity > 0
      ? `rgba(76, 175, 80, ${0.2 + intensity * 0.8})`
      : '#E0E0E0';
    block.title = `${h}:00 — ${minutes}m active`;
    bar.appendChild(block);
  }
}
