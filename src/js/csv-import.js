// Torque Pro CSV parsing: column detection, filtering, metrics, chart and map population.

import { findKey, series, contextualPowertrainFilter, parseTime, fmt, lastValid, maximum, average } from './utils.js';
import { setMetric, showError } from './dom.js';
import { destroyCharts, renderLineChart } from './charts.js';
import { map, renderInitialRoute, loadTimeline } from './map.js';

export function processCSV(text, fileName = '') {
  Papa.parse(text, {
    header: true, skipEmptyLines: 'greedy', dynamicTyping: false,
    complete: ({ data, meta, errors }) => {
      if (!data.length || !meta.fields?.length) {
        showError('No usable rows or header fields were found.');
        return;
      }
      const f = meta.fields;
      const k = {
        time: findKey(f, 'Device Time'), lat: findKey(f, 'Latitude', 'GPS Latitude(°)'), lng: findKey(f, 'Longitude', 'GPS Longitude(°)'),
        gpsSpeed: findKey(f, 'Speed (GPS)(km/h)'), obdSpeed: findKey(f, 'Speed (OBD)(km/h)'), sats: findKey(f, 'GPS Satellites'),
        adapterV: findKey(f, 'Voltage (OBD Adapter)(V)'), moduleV: findKey(f, 'Voltage (Control Module)(V)'),
        gx: findKey(f, 'G(x)'), gy: findKey(f, 'G(y)'), gz: findKey(f, 'G(z)'), gcal: findKey(f, 'G(calibrated)'),
        accTotal: findKey(f, 'Acceleration Sensor(Total)(g)'), accX: findKey(f, 'Acceleration Sensor(X axis)(g)'),
        accY: findKey(f, 'Acceleration Sensor(Y axis)(g)'), accZ: findKey(f, 'Acceleration Sensor(Z axis)(g)'),
        battery: findKey(f, 'Android device Battery Level(%)'), load: findKey(f, 'Engine Load(%)'), rpm: findKey(f, 'Engine RPM(rpm)'),
        fuelFlow: findKey(f, 'Fuel flow rate/hour(l/hr)'), accuracy: findKey(f, 'GPS Accuracy(m)'),
        altitude: findKey(f, 'GPS Altitude(m)', 'Altitude'), bearing: findKey(f, 'GPS Bearing(°)', 'Bearing'),
        iat: findKey(f, 'Intake Air Temperature(°C)'), engineTemp: findKey(f, 'Engine Temp(°C)'),
        kplLong: findKey(f, 'Kilometers Per Litre(Long Term Average)(kpl)'),
        l100Long: findKey(f, 'Litres Per 100 Kilometer(Long Term Average)(l/100km)'), mpgLong: findKey(f, 'Miles Per Gallon(Long Term Average)(mpg)'),
        odometer: findKey(f, 'Odometer(from ECU)(km)'), tripKpl: findKey(f, 'Trip average KPL(kpl)'), tripL100: findKey(f, 'Trip average Litres/100 KM(l/100km)'),
        speedDiff: findKey(f, 'GPS vs OBD Speed difference(km/h)'), hdop: findKey(f, 'Horizontal Dilution of Precision')
      };
      const s = {};
      Object.entries(k).forEach(([n, key]) => s[n] = series(data, key));
      const rawPowertrain = { rpm: [...s.rpm], fuelFlow: [...s.fuelFlow], tripL100: [...s.tripL100] };
      const powertrainFiltered = contextualPowertrainFilter(rawPowertrain, s.obdSpeed, s.load);
      s.rpm = powertrainFiltered.rpm;
      s.fuelFlow = powertrainFiltered.fuelFlow;
      s.tripL100 = powertrainFiltered.tripL100;

      const times = data.map(r => parseTime(k.time ? r[k.time] : null));
      const labels = times.map(t => t.time);
      const date = times.find(t => t.date)?.date || 'Date N/A';
      document.getElementById('display-date').textContent = date;
      document.getElementById('file-name').textContent = fileName ? `• ${fileName}` : '';

      setMetric('m-speed', fmt(lastValid(s.obdSpeed), 1, 'km/h'));
      setMetric('m-rpm', fmt(maximum(s.rpm), 0, 'rpm'));
      setMetric('m-rpm-current', fmt(lastValid(s.rpm), 0, 'rpm'));
      setMetric('m-load', fmt(lastValid(s.load), 1, '%'));
      setMetric('m-flow', fmt(average(s.load), 1, '%'));
      setMetric('m-iat', fmt(average(s.iat), 1, '°C'));
      const hasEngineTemp = k.engineTemp != null;
      document.getElementById('m-sats-title').textContent = hasEngineTemp ? 'Engine Temp(°C)' : 'Satellites Locked';
      setMetric('m-sats', hasEngineTemp ? fmt(lastValid(s.engineTemp), 1, '°C') : fmt(maximum(s.sats), 0));
      setMetric('m-volt', fmt(average(s.adapterV), 2, 'V'));
      setMetric('m-battery', fmt(lastValid(s.battery), 0, '%'));
      setMetric('m-points', String(data.length));

      const pathByRow = data.map((r, i) =>
        Number.isFinite(s.lat[i]) && Number.isFinite(s.lng[i]) && Math.abs(s.lat[i]) <= 90 && Math.abs(s.lng[i]) <= 180
          ? [s.lat[i], s.lng[i]] : null);
      const path = pathByRow.filter(Boolean);
      renderInitialRoute(path);

      const summary = [
        ['Rows', data.length], ['GPS points', path.length], ['Avg GPS accuracy', fmt(average(s.accuracy), 1, 'm')],
        ['Avg HDOP', fmt(average(s.hdop), 2)],
        ['Altitude range', `${fmt(Math.min(...s.altitude.filter(Number.isFinite)), 1, 'm')} – ${fmt(Math.max(...s.altitude.filter(Number.isFinite)), 1, 'm')}`],
        ['Max OBD Speed', fmt(maximum(s.obdSpeed), 1, 'km/h')], ['Average RPM (filtered)', fmt(average(s.rpm), 0, 'rpm')],
        ['Max RPM (filtered)', fmt(maximum(s.rpm), 0, 'rpm')], ['RPM readings filtered', powertrainFiltered.counts.rpm],
        ['Average fuel flow (filtered)', fmt(average(s.fuelFlow), 2, 'l/hr')], ['Raw max fuel flow', fmt(maximum(rawPowertrain.fuelFlow), 2, 'l/hr')],
        ['Fuel-flow readings filtered', powertrainFiltered.counts.fuelFlow], ['Long-term economy', fmt(lastValid(s.l100Long), 2, 'l/100km')],
        ['Long-term KPL', fmt(lastValid(s.kplLong), 2, 'km/l')], ['Long-term MPG', fmt(lastValid(s.mpgLong), 2, 'mpg')],
        ['Trip KPL', fmt(lastValid(s.tripKpl), 2, 'km/l')], ['Odometer', fmt(lastValid(s.odometer), 1, 'km')],
        ['Max acceleration', fmt(maximum(s.accTotal), 2, 'g')], ['Average speed difference', fmt(average(s.speedDiff), 2, 'km/h')],
        ['Control module voltage', fmt(average(s.moduleV), 2, 'V')], ['CSV columns detected', f.length]
      ];
      document.getElementById('parameter-grid').innerHTML = summary.map(([a, b]) => `<div class="parameter"><span>${a}</span><strong>${b}</strong></div>`).join('');

      destroyCharts();
      renderLineChart('speedChart', labels, [
        { label: 'OBD speed (km/h)', data: s.obdSpeed, borderColor: '#38bdf8', spanGaps: true },
        { label: 'GPS speed (km/h)', data: s.gpsSpeed, borderColor: '#4ade80', spanGaps: true },
        ...(hasEngineTemp ? [{ label: 'Engine Temp (°C)', data: s.engineTemp, borderColor: '#fb923c', spanGaps: true, yAxisID: 'y1', noSmooth: true }] : [])
      ], hasEngineTemp ? {
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: '#334155' } },
          y: { position: 'left', ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
          y1: { position: 'right', ticks: { color: '#fb923c' }, grid: { drawOnChartArea: false } }
        }
      } : undefined);
      renderLineChart('engineChart', labels, [
        { label: 'RPM filtered', data: s.rpm, borderColor: '#fbbf24', yAxisID: 'y' },
        { label: 'RPM raw', data: rawPowertrain.rpm, borderColor: 'rgba(251,191,36,.22)', borderWidth: 1, yAxisID: 'y', hidden: true },
        { label: 'Engine load (%)', data: s.load, borderColor: '#f87171', yAxisID: 'y1' }
      ], {
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: '#334155' } },
          y: { position: 'left', ticks: { color: '#fbbf24' }, grid: { color: '#334155' } },
          y1: { position: 'right', ticks: { color: '#f87171' }, grid: { drawOnChartArea: false } }
        }
      });
      renderLineChart('fuelChart', labels, [
        { label: 'Fuel flow filtered (l/hr)', data: s.fuelFlow, borderColor: '#a78bfa', yAxisID: 'y' },
        { label: 'Litres per 100km (long term avg)', data: s.l100Long, borderColor: '#4ade80', spanGaps: true, yAxisID: 'y1' }
      ], {
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: '#334155' } },
          y: { position: 'left', ticks: { color: '#a78bfa' }, grid: { color: '#334155' } },
          y1: { position: 'right', ticks: { color: '#4ade80' }, grid: { drawOnChartArea: false } }
        }
      });
      renderLineChart('accelChart', labels, [
        { label: 'Total (g)', data: s.accTotal, borderColor: '#f8fafc' },
        { label: 'X (g)', data: s.accX, borderColor: '#f87171' },
        { label: 'Y (g)', data: s.accY, borderColor: '#fbbf24' },
        { label: 'Z (g)', data: s.accZ, borderColor: '#4ade80' }
      ]);
      renderLineChart('gForceChart', labels, [
        { label: 'G(x)', data: s.gx, borderColor: '#f87171' },
        { label: 'G(y)', data: s.gy, borderColor: '#fbbf24' },
        { label: 'G(z)', data: s.gz, borderColor: '#a78bfa' },
        { label: 'G calibrated', data: s.gcal, borderColor: '#38bdf8' }
      ]);

      loadTimeline({ total: data.length, labels, pathByRow, series: s, hasEngineTemp });

      const warning = errors.length ? ` ${errors.length} CSV parsing warning(s) were reported.` : '';
      const statusEl = document.getElementById('status');
      statusEl.className = 'status';
      statusEl.textContent = `Loaded ${data.length} rows and detected ${f.length} columns. Filtered ${powertrainFiltered.counts.rpm} RPM, ${powertrainFiltered.counts.fuelFlow} fuel-flow, and ${powertrainFiltered.counts.tripL100} trip-economy reading(s) using engine-load context.${warning}`;
      setTimeout(() => map.invalidateSize(), 100);
    }
  });
}

export async function tryLoadDefaultCSV() {
  try {
    const name = 'trackLog-2026-example_data_sim.csv';
    const response = await fetch(`./assets/${name}`, { cache: 'no-store' });
    if (!response.ok) return;
    processCSV(await response.text(), name);
  } catch (_) {
    // Missing or inaccessible default file: stay empty silently.
  }
}
