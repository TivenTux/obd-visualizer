// Small DOM helpers used across modules.

function setMetric(id, value) {
  document.getElementById(id).innerHTML = value;
}

function showError(msg) {
  const el = document.getElementById('status');
  el.className = 'status error';
  el.textContent = msg;
}
