// Entry point: wires up UI controls and kicks off the default CSV load.

document.querySelectorAll('.collapse-toggle').forEach(button => button.addEventListener('click', () => {
  const panel = button.closest('.collapsible-chart');
  setChartPanelCollapsed(panel, !panel.classList.contains('collapsed'));
}));

const ACCEL_GRAPH_PANELS = ['accelChart', 'gForceChart'];
const ACCEL_GRAPH_PREF_KEY = 'obd-viz-show-accel-graphs';
const accelGraphsToggle = document.getElementById('toggle-accel-graphs');

function applyAccelGraphsVisibility(shown) {
  ACCEL_GRAPH_PANELS.forEach(id => {
    const panel = document.querySelector(`.collapsible-chart[data-chart-panel="${id}"]`);
    if (panel) setChartPanelCollapsed(panel, !shown);
  });
}

const storedAccelPref = localStorage.getItem(ACCEL_GRAPH_PREF_KEY);
const accelGraphsShown = storedAccelPref === null ? true : storedAccelPref === 'true';
accelGraphsToggle.checked = accelGraphsShown;
applyAccelGraphsVisibility(accelGraphsShown);
accelGraphsToggle.addEventListener('change', () => {
  localStorage.setItem(ACCEL_GRAPH_PREF_KEY, String(accelGraphsToggle.checked));
  applyAccelGraphsVisibility(accelGraphsToggle.checked);
});

document.querySelectorAll('.graph-smoothing').forEach(slider => slider.addEventListener('input', () => applyGraphSmoothing(slider)));

document.getElementById('timelineSlider').addEventListener('input', () => { stopPlayback(); updateTimelineView(); });
document.getElementById('timelineStart').addEventListener('click', () => {
  stopPlayback();
  document.getElementById('timelineSlider').value = 1;
  updateTimelineView();
});
document.getElementById('timelineEnd').addEventListener('click', () => {
  stopPlayback();
  if (appState.timelineState) {
    document.getElementById('timelineSlider').value = appState.timelineState.total;
    updateTimelineView();
  }
});
document.getElementById('timelinePlay').addEventListener('click', () => {
  const playing = document.getElementById('timelinePlay').dataset.playing === 'true';
  playing ? stopPlayback() : startPlayback();
});
document.getElementById('mapZoomActive').addEventListener('click', () => {
  const button = document.getElementById('mapZoomActive');
  setFollowCurrent(!button.classList.contains('active'));
});
document.getElementById('mapFitRoute').addEventListener('click', () => { setFollowCurrent(false); fitCompleteRoute(); });

document.getElementById('csvFileInput').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const format = document.getElementById('dataFormatSelect').value;
  if (format !== 'torque-pro') {
    showError('That import format is not supported yet. Only Torque Pro logs can be imported for now.');
    e.target.value = '';
    return;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Please select a .csv file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => { stopPlayback(); processCSV(ev.target.result, file.name); };
  reader.onerror = () => showError('The file could not be read.');
  reader.readAsText(file);
});

window.addEventListener('load', tryLoadDefaultCSV);
