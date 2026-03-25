import { Chart, registerables } from 'chart.js';
import { getScreenTimeState } from './storage';
import { ScreenTimeState, HourlySlotMap } from './types';
import {
  calculateStats,
  calculateTodaySessionStats,
  filterSlotsByRange,
  transformForBarChart,
  transformForDailyBarChart,
  filterAggregatesByRange,
} from './dashboard-utils';

Chart.register(...registerables);

document.addEventListener('DOMContentLoaded', () => initDashboard());

let currentRange = 0;
let mainChart: Chart | null = null;
let drillChart: Chart | null = null;

async function initDashboard(): Promise<void> {
  const state = await getScreenTimeState();
  renderStats(state, currentRange);
  renderChart(state, currentRange);
  bindRangeButtons();
}

function renderStats(state: ScreenTimeState, days: number): void {
  const stats = calculateStats(state.hourlySlots, days, state.dailyAggregates);

  const timeEl = document.getElementById('stat-time');
  const timeLabel = document.getElementById('label-time');
  const peakEl = document.getElementById('stat-peak');
  const sessionsEl = document.getElementById('stat-sessions');
  const sessionsLabel = document.getElementById('label-sessions');
  const breaksEl = document.getElementById('stat-breaks');
  const breaksLabel = document.getElementById('label-breaks');

  const h = Math.floor(stats.avgDailyMinutes / 60);
  const m = stats.avgDailyMinutes % 60;

  if (timeEl) timeEl.textContent = `${h}h ${m}m`;
  if (timeLabel) timeLabel.textContent = days === 0 ? 'Total on-screen' : 'Avg on-screen/day';
  if (peakEl) peakEl.textContent = `${stats.peakHour}:00`;

  if (days === 0) {
    const todayStats = calculateTodaySessionStats(state.sessions, state.currentSession);
    if (sessionsEl) sessionsEl.textContent = String(todayStats.sessionCount);
    if (breaksEl) breaksEl.textContent = String(todayStats.breakCount);
    if (sessionsLabel) sessionsLabel.textContent = 'Sessions';
    if (breaksLabel) breaksLabel.textContent = 'Breaks';
  } else {
    if (sessionsEl) sessionsEl.textContent = String(stats.avgSessionsPerDay);
    if (breaksEl) breaksEl.textContent = String(stats.avgBreaksPerDay);
    if (sessionsLabel) sessionsLabel.textContent = 'Avg sessions/day';
    if (breaksLabel) breaksLabel.textContent = 'Avg breaks/day';
  }
}

function renderChart(state: ScreenTimeState, days: number): void {
  const canvas = document.getElementById('chart-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  if (mainChart) mainChart.destroy();
  hideDrillDown();

  const filtered = filterSlotsByRange(state.hourlySlots, days);

  if (days === 0) {
    renderHourlyBarChart(canvas, filtered);
  } else {
    renderDailyBarChart(canvas, filtered, state, days);
  }
}

function renderHourlyBarChart(canvas: HTMLCanvasElement, slots: HourlySlotMap): void {
  const data = transformForBarChart(slots);

  mainChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: data.values.map((v) =>
          v >= 30 ? 'rgba(76, 175, 80, 0.9)' : 'rgba(200, 230, 201, 0.9)'
        ),
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 60,
          ticks: { stepSize: 15 },
          title: { display: true, text: 'Minutes' },
        },
        x: {
          grid: { display: false },
          title: { display: true, text: 'Hour of day' },
        },
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Hourly Active Time', font: { size: 14 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} min active`,
          },
        },
      },
    },
  });
}

function renderDailyBarChart(
  canvas: HTMLCanvasElement,
  slots: HourlySlotMap,
  state: ScreenTimeState,
  days: number,
): void {
  const data = transformForDailyBarChart(slots);
  const avg = data.average || 0;

  mainChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Minutes' },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } },
          title: { display: true, text: 'Date' },
        },
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Daily Active Time', font: { size: 14 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const mins = ctx.parsed.y ?? 0;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return `${h}h ${m}m active`;
            },
          },
        },
      },
      onClick: (_event, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const dateStr = data.labels[idx];
          showDrillDown(dateStr, state, days);
        }
      },
    },
    plugins: [{
      id: 'avgLine',
      afterDraw: (chart) => {
        if (avg <= 0) return;
        const yScale = chart.scales.y;
        const y = yScale.getPixelForValue(avg);
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.stroke();
        // label
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('avg', chart.chartArea.right, y - 4);
        ctx.restore();
      },
    }],
  });
}

function showDrillDown(dateStr: string, state: ScreenTimeState, days: number): void {
  const panel = document.getElementById('drill-down');
  const dateEl = document.getElementById('drill-down-date');
  const summaryEl = document.getElementById('drill-down-summary');
  const canvas = document.getElementById('drill-down-canvas') as HTMLCanvasElement;
  if (!panel || !dateEl || !summaryEl || !canvas) return;

  panel.classList.remove('hidden');
  dateEl.textContent = dateStr;

  // Get hourly slots for this date
  const dateSlots: HourlySlotMap = {};
  for (const [key, val] of Object.entries(state.hourlySlots)) {
    if (key.substring(0, 10) === dateStr) {
      dateSlots[key] = val;
    }
  }

  // Get session/break info — use local date, not UTC
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let sessionCount = 0;
  let breakCount = 0;

  if (dateStr === todayStr) {
    const todayStats = calculateTodaySessionStats(state.sessions, state.currentSession);
    sessionCount = todayStats.sessionCount;
    breakCount = todayStats.breakCount;
  } else {
    const agg = state.dailyAggregates.find((a) => a.date === dateStr);
    if (agg) {
      sessionCount = agg.sessionCount;
      breakCount = agg.breakCount;
    }
  }

  const totalMin = Object.values(dateSlots).reduce((s, v) => s + v, 0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  summaryEl.textContent = `${h}h ${m}m · ${sessionCount} sessions · ${breakCount} breaks`;

  // Render hourly bar chart for this date
  if (drillChart) drillChart.destroy();
  const data = transformForBarChart(dateSlots);

  drillChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Active minutes',
        data: data.values,
        backgroundColor: data.values.map((v) =>
          v >= 30 ? 'rgba(76, 175, 80, 0.9)' : 'rgba(200, 230, 201, 0.9)'
        ),
        borderRadius: 4,
        maxBarThickness: 30,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 60,
          ticks: { stepSize: 15 },
          title: { display: true, text: 'Minutes' },
        },
        x: {
          grid: { display: false },
          title: { display: true, text: 'Hour of day' },
        },
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Hourly Active Time', font: { size: 14 } },
      },
    },
  });
}

function hideDrillDown(): void {
  const panel = document.getElementById('drill-down');
  if (panel) panel.classList.add('hidden');
  if (drillChart) {
    drillChart.destroy();
    drillChart = null;
  }
}

function bindRangeButtons(): void {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = parseInt(btn.getAttribute('data-range') || '0', 10);
      const freshState = await getScreenTimeState();
      renderStats(freshState, currentRange);
      renderChart(freshState, currentRange);
    });
  });
}
