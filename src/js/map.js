// Leaflet map, GPS route rendering, and timeline playback/follow controls.

import { appState } from './state.js';
import { setMetric } from './dom.js';
import { lastValid, average, maximum, fmt } from './utils.js';

export const map = L.map('map', { zoomSnap: .25 }).setView([38.0, 23.7], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

export const route = L.polyline([], { color: '#38bdf8', weight: 4, opacity: .9 }).addTo(map);
let startMarker = null;
let endMarker = null;
let playbackTimer = null;
let followCurrent = false;
let followTimer = null;

export function renderInitialRoute(path) {
  route.setLatLngs(path);
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  if (path.length) {
    startMarker = L.marker(path[0]).addTo(map).bindPopup('Start');
    endMarker = L.marker(path[path.length - 1]).addTo(map).bindPopup('End');
    if (path.length === 1) map.setView(path[0], 16);
    else map.fitBounds(route.getBounds(), { padding: [30, 30], maxZoom: 17 });
  }
}

function latestActivePosition() {
  if (!appState.timelineState) return null;
  const { activeCount, pathByRow } = appState.timelineState;
  for (let i = activeCount - 1; i >= 0; i--) if (pathByRow[i]) return pathByRow[i];
  return null;
}

function setPlaybackState(playing) {
  const button = document.getElementById('timelinePlay'), icon = document.getElementById('timelinePlayIcon');
  button.dataset.playing = String(playing);
  button.title = playing ? 'Pause timeline' : 'Play timeline';
  button.setAttribute('aria-label', button.title);
  icon.innerHTML = playing ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}

export function stopPlayback() {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  setPlaybackState(false);
}

export function startPlayback() {
  if (!appState.timelineState || appState.timelineState.total < 2) return;
  const slider = document.getElementById('timelineSlider');
  if (Number(slider.value) >= appState.timelineState.total) slider.value = 1;
  stopPlayback();
  setPlaybackState(true);
  playbackTimer = setInterval(() => {
    const next = Number(slider.value) + 1;
    if (next > appState.timelineState.total) {
      stopPlayback();
      return;
    }
    slider.value = next;
    updateTimelineView();
    if (next >= appState.timelineState.total) stopPlayback();
  }, 180);
}

export function fitCompleteRoute() {
  if (!appState.timelineState) return;
  const full = appState.timelineState.pathByRow.filter(Boolean);
  if (!full.length) return;
  if (full.length === 1) map.setView(full[0], 16);
  else map.fitBounds(L.latLngBounds(full), { padding: [30, 30], maxZoom: 17 });
}

export function setFollowCurrent(active) {
  followCurrent = active;
  const button = document.getElementById('mapZoomActive');
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  if (followTimer) {
    clearInterval(followTimer);
    followTimer = null;
  }
  if (active) {
    zoomToActivePosition();
    followTimer = setInterval(zoomToActivePosition, 2500);
  }
}

function zoomToActivePosition() {
  const position = latestActivePosition();
  if (position) map.flyTo(position, Math.max(map.getZoom(), 16), { duration: .5 });
}

export function updateTimelineView() {
  const timelineState = appState.timelineState;
  if (!timelineState) return;
  const slider = document.getElementById('timelineSlider');
  const count = Math.max(1, Math.min(timelineState.total, Number(slider.value)));
  timelineState.activeCount = count;
  const pct = Math.round(count / timelineState.total * 100);
  const time = timelineState.labels[count - 1] || '--:--:--';
  document.getElementById('timelineValue').value = `${pct}% • ${time}`;

  const activePath = timelineState.pathByRow.slice(0, count).filter(Boolean);
  route.setLatLngs(activePath);
  if (endMarker) map.removeLayer(endMarker);
  if (activePath.length) endMarker = L.marker(activePath[activePath.length - 1]).addTo(map).bindPopup(`Active point: ${time}`);

  const a = name => timelineState.series[name].slice(0, count);
  setMetric('m-speed', fmt(lastValid(a('obdSpeed')), 1, 'km/h'));
  setMetric('m-rpm', fmt(maximum(a('rpm')), 0, 'rpm'));
  setMetric('m-rpm-current', fmt(lastValid(a('rpm')), 0, 'rpm'));
  setMetric('m-load', fmt(lastValid(a('load')), 1, '%'));
  setMetric('m-flow', fmt(average(a('load')), 1, '%'));
  setMetric('m-iat', fmt(average(a('iat')), 1, '°C'));
  setMetric('m-sats', fmt(maximum(a('sats')), 0));
  setMetric('m-volt', fmt(average(a('adapterV')), 2, 'V'));
  setMetric('m-battery', fmt(lastValid(a('battery')), 0, '%'));
  setMetric('m-points', `${count} <small>/ ${timelineState.total}</small>`);
  appState.charts.forEach(chart => chart.draw());
}

export function loadTimeline({ total, labels, pathByRow, series }) {
  appState.timelineState = { total, activeCount: total, labels, pathByRow, series };
  const timelineSlider = document.getElementById('timelineSlider');
  timelineSlider.max = total;
  timelineSlider.value = total;
  timelineSlider.disabled = total < 2;
  updateTimelineView();
}

map.on('dragstart zoomstart', () => { if (followCurrent) setFollowCurrent(false); });
