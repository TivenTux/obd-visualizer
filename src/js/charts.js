// Chart.js setup, rendering, smoothing and collapse-panel behavior.

import { appState } from './state.js';
import { smoothSeries } from './utils.js';

const inactiveTimelinePlugin = {
  id: 'inactiveTimeline',
  afterDatasetsDraw(chart) {
    const timelineState = appState.timelineState;
    if (!timelineState || timelineState.activeCount >= timelineState.total) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;
    const boundary = scales.x.getPixelForValue(Math.max(0, timelineState.activeCount - 0.5));
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,.68)';
    ctx.fillRect(Math.max(chartArea.left, boundary), chartArea.top, chartArea.right - Math.max(chartArea.left, boundary), chartArea.bottom - chartArea.top);
    ctx.restore();
  }
};
Chart.register(inactiveTimelinePlugin);

export function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#f8fafc', boxWidth: 12 } },
      decimation: { enabled: true, algorithm: 'lttb', samples: 500 }
    },
    elements: { point: { radius: 0, hitRadius: 5 }, line: { borderWidth: 2 } },
    scales: {
      x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    },
    ...extra
  };
}

export function graphSmoothingValue(canvasId) {
  const slider = document.querySelector(`.graph-smoothing[data-chart="${canvasId}"]`);
  return slider ? Number(slider.value) : 0;
}

export function renderLineChart(canvas, labels, datasets, options) {
  const pct = graphSmoothingValue(canvas);
  datasets.forEach(ds => {
    ds._sourceData = [...ds.data];
    ds.data = smoothSeries(ds._sourceData, pct);
    ds.spanGaps = true;
  });
  const chart = new Chart(document.getElementById(canvas), { type: 'line', data: { labels, datasets }, options: baseOptions(options) });
  appState.charts.push(chart);
}

export function destroyCharts() {
  appState.charts.forEach(c => c.destroy());
  appState.charts = [];
}

export function applyGraphSmoothing(slider) {
  const canvasId = slider.dataset.chart, pct = Number(slider.value);
  const output = document.getElementById(`${slider.id}-value`);
  if (output) output.value = `${pct}%`;
  const chart = appState.charts.find(c => c.canvas.id === canvasId);
  if (!chart) return;
  chart.data.datasets.forEach(ds => { if (ds._sourceData) ds.data = smoothSeries(ds._sourceData, pct); });
  chart.update('none');
}

export function setChartPanelCollapsed(panel, collapsed) {
  const button = panel.querySelector('.collapse-toggle');
  panel.classList.toggle('collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  const title = panel.querySelector('h2').textContent;
  button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
  if (!collapsed) {
    const canvas = panel.querySelector('canvas');
    const chart = appState.charts.find(c => c.canvas === canvas);
    requestAnimationFrame(() => { if (chart) chart.resize(); });
  }
}
