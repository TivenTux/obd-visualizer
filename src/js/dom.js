// Small DOM helpers used across modules.

export function setMetric(id, value) {
  document.getElementById(id).innerHTML = value;
}

export function showError(msg) {
  const el = document.getElementById('status');
  el.className = 'status error';
  el.textContent = msg;
}
