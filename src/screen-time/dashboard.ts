import { Chart, registerables } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { getScreenTimeState } from './storage';
import { ScreenTimeState } from './types';
import { calculateStats, filterSlotsByRange, transformForHeatmap, HeatmapPoint } from './dashboard-utils';

Chart.register(...registerables, MatrixController, MatrixElement);

document.addEventListener('DOMContentLoaded', () => initDashboard());

let currentRange = 0;
let chartInstance: Chart | null = null;

async function initDashboard(): Promise<void> {
  const state = await getScreenTimeState();
  renderStats(state, currentRange);
  renderHeatmap(state, currentRange);
  bindRangeButtons();
}

function renderStats(state: ScreenTimeState, days: number): void {
  const stats = calculateStats(state.hourlySlots, days);

  const avgEl = document.getElementById('avg-daily');
  const avgLabel = document.querySelector('.summary-card:first-child .summary-card__label');
  const peakEl = document.getElementById('peak-hour');
  const vsEl = document.getElementById('today-vs-avg');
  const vsLabel = document.querySelector('.summary-card:last-child .summary-card__label');

  if (avgEl) {
    const h = Math.floor(stats.avgDailyMinutes / 60);
    const m = stats.avgDailyMinutes % 60;
    avgEl.textContent = `${h}h ${m}m`;
  }
  if (avgLabel) avgLabel.textContent = days === 0 ? 'Total on-screen' : 'Avg on-screen/day';
  if (peakEl) peakEl.textContent = `${stats.peakHour}:00`;
  if (vsEl) {
    if (days === 0) {
      vsEl.textContent = '--';
    } else {
      const sign = stats.todayVsAvgPercent >= 0 ? '+' : '';
      vsEl.textContent = `${sign}${stats.todayVsAvgPercent}%`;
    }
  }
  if (vsLabel) vsLabel.textContent = days === 0 ? 'View' : 'Today vs average';
}

function renderHeatmap(state: ScreenTimeState, days: number): void {
  const canvas = document.getElementById('heatmap-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  if (chartInstance) chartInstance.destroy();

  const filtered = filterSlotsByRange(state.hourlySlots, days);
  const data = transformForHeatmap(filtered);

  const dates = [...new Set(data.map((d) => d.x))].sort();

  chartInstance = new Chart(canvas, {
    type: 'matrix' as any,
    data: {
      datasets: [{
        label: 'Active Minutes',
        data: data as any,
        backgroundColor: (ctx: any) => {
          const v = ctx.dataset.data[ctx.dataIndex]?.v || 0;
          const alpha = v / 60;
          return `rgba(76, 175, 80, ${Math.max(0.05, alpha)})`;
        },
        width: ({ chart }: any) => {
          const { left, right } = chart.chartArea || {};
          if (!left && left !== 0) return 20;
          return Math.max(10, (right - left) / Math.max(dates.length, 1) - 2);
        },
        height: ({ chart }: any) => {
          const { top, bottom } = chart.chartArea || {};
          if (!top && top !== 0) return 15;
          return Math.max(8, (bottom - top) / 24 - 2);
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          labels: dates,
          offset: true,
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
        y: {
          type: 'category',
          labels: Array.from({ length: 24 }, (_, i) => String(i)),
          offset: true,
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx: any) => {
              const raw = ctx.raw as HeatmapPoint;
              return `${raw.x}, ${raw.y}h: ${raw.v} min active`;
            },
          },
        },
        legend: { display: false },
      },
    },
  });
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
      renderHeatmap(freshState, currentRange);
    });
  });
}
