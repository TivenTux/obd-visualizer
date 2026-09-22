// Pure data parsing / numeric helpers shared across the app.

const norm = s => String(s ?? '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');
const valid = v => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-';
const number = v => {
  if (!valid(v)) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const average = a => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
};
const maximum = a => {
  const v = a.filter(Number.isFinite);
  return v.length ? Math.max(...v) : null;
};
const lastValid = a => {
  for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i];
  return null;
};
const median = a => {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function hampelFilter(values, radius = 3, sigma = 3, maxValue = 8000, maxStep = 3500) {
  const out = [...values], flags = new Array(values.length).fill(false);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const window = values.slice(Math.max(0, i - radius), Math.min(values.length, i + radius + 1)).filter(Number.isFinite);
    const med = median(window);
    const mad = median(window.map(x => Math.abs(x - med)));
    const robustSigma = mad === null ? 0 : 1.4826 * mad;
    const prev = out.slice(Math.max(0, i - 2), i).filter(Number.isFinite);
    const prevMed = median(prev);
    const impossible = v < 0 || v > maxValue;
    const statistical = robustSigma > 0 && Math.abs(v - med) > sigma * robustSigma;
    const isolatedJump = Number.isFinite(prevMed) && Math.abs(v - prevMed) > maxStep && Number.isFinite(med) && Math.abs(v - med) > maxStep / 2;
    if (impossible || statistical || isolatedJump) {
      out[i] = med;
      flags[i] = true;
    }
  }
  return { values: out, flags, count: flags.filter(Boolean).length };
}

const fmt = (v, d = 1, u = '') => Number.isFinite(v) ? `${v.toFixed(d)}${u ? ` <small>${u}</small>` : ''}` : 'N/A';

function parseTime(v) {
  if (!valid(v)) return { date: null, time: '--:--:--' };
  const m = String(v).trim().match(/^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : { date: null, time: String(v) };
}

function findKey(fields, ...names) {
  const wanted = names.map(norm);
  return fields.find(f => wanted.includes(norm(f))) || fields.find(f => wanted.some(n => norm(f).includes(n)));
}

function series(rows, key) {
  return rows.map(r => key ? number(r[key]) : null);
}

function contextualPowertrainFilter(raw, obdSpeed, engineLoad) {
  const filtered = { rpm: [], fuelFlow: [], tripL100: [] }, flags = { rpm: [], fuelFlow: [], tripL100: [] };
  for (let i = 0; i < raw.rpm.length; i++) {
    const speed = Number.isFinite(obdSpeed[i]) ? Math.max(0, obdSpeed[i]) : null;
    const load = Number.isFinite(engineLoad[i]) ? Math.min(100, Math.max(0, engineLoad[i])) : null;

    // RPM: the accepted ceiling rises with engine load.
    const r = raw.rpm[i];
    const rpmLoadLimit = load === null ? 8000 : load < 10 ? 2500 : load < 25 ? 4000 : load < 50 ? 6500 : 8000;
    const rpmOk = Number.isFinite(r) && r >= 0 && r <= rpmLoadLimit;
    filtered.rpm.push(rpmOk ? r : null);
    flags.rpm.push(Number.isFinite(r) && !rpmOk);

    // Fuel flow: allowed flow rises progressively with engine load.
    const f = raw.fuelFlow[i];
    const fuelLoadLimit = load === null ? 80 : Math.min(80, Math.max(3, 1.5 + load * 0.75));
    const flowOk = Number.isFinite(f) && f >= 0 && f <= fuelLoadLimit;
    filtered.fuelFlow.push(flowOk ? f : null);
    flags.fuelFlow.push(Number.isFinite(f) && !flowOk);

    // Trip l/100 km: engine load sets the plausible upper limit. OBD speed is used
    // only to avoid mathematically unstable consumption readings below 5 km/h.
    const t = raw.tripL100[i];
    const tripLoadLimit = load === null ? 100 : Math.min(100, Math.max(15, 10 + load * 2));
    const tripOk = Number.isFinite(t) && t >= 0 && t <= tripLoadLimit &&
      (load === null || load >= 2) && (speed === null || speed >= 5);
    filtered.tripL100.push(tripOk ? t : null);
    flags.tripL100.push(Number.isFinite(t) && !tripOk);
  }
  const rpmH = hampelFilter(filtered.rpm, 3, 3, 8000, 3500);
  const fuelH = hampelFilter(filtered.fuelFlow, 3, 3, 80, 20);
  const tripH = hampelFilter(filtered.tripL100, 3, 3, 100, 35);
  const count = (contextFlags, hampelResult) => contextFlags.filter(Boolean).length + hampelResult.count;
  return {
    rpm: rpmH.values, fuelFlow: fuelH.values, tripL100: tripH.values,
    counts: { rpm: count(flags.rpm, rpmH), fuelFlow: count(flags.fuelFlow, fuelH), tripL100: count(flags.tripL100, tripH) }
  };
}

function interpolateMissing(values) {
  const out = [...values], validIdx = [];
  for (let i = 0; i < out.length; i++) if (Number.isFinite(out[i])) validIdx.push(i);
  if (!validIdx.length) return out;
  if (validIdx.length === 1) return out.map(() => out[validIdx[0]]);
  for (let i = 0; i < validIdx[0]; i++) out[i] = out[validIdx[0]];
  for (let p = 0; p < validIdx.length - 1; p++) {
    const a = validIdx[p], b = validIdx[p + 1], va = out[a], vb = out[b];
    for (let i = a + 1; i < b; i++) out[i] = va + (vb - va) * (i - a) / (b - a);
  }
  for (let i = validIdx[validIdx.length - 1] + 1; i < out.length; i++) out[i] = out[validIdx[validIdx.length - 1]];
  return out;
}

function smoothSeries(values, percentage) {
  const source = interpolateMissing(values);
  const p = Math.max(0, Math.min(100, percentage)) / 100;
  if (!p || source.length < 3) return source;
  const radius = Math.max(1, Math.round(p * 10)), passes = 1 + Math.floor(p * 2);
  let result = [...source];
  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    for (let i = 0; i < result.length; i++) {
      let sum = 0, weight = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(result.length - 1, i + radius); j++) {
        const w = radius + 1 - Math.abs(j - i);
        sum += result[j] * w;
        weight += w;
      }
      next[i] = sum / weight;
    }
    result = next;
  }
  return source.map((v, i) => v * (1 - p) + result[i] * p);
}
