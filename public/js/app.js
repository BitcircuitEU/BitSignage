const elements = {
  pdfPath: document.getElementById('pdfPath'),
  pdfSize: document.getElementById('pdfSize'),
  pdfUpdated: document.getElementById('pdfUpdated'),
  tvStatus: document.getElementById('tvStatus'),
  tvError: document.getElementById('tvError'),
  uptime: document.getElementById('uptime'),
  serverTime: document.getElementById('serverTime'),
  hostName: document.getElementById('hostName'),
  wsStatus: document.getElementById('wsStatus'),
  reloadPdf: document.getElementById('reloadPdf'),
  tvOn: document.getElementById('tvOn'),
  tvOff: document.getElementById('tvOff'),
};

let ws;

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('de-DE');
}

function formatUptime(seconds) {
  if (seconds == null) return '-';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
}

function setWsStatus(online) {
  if (!elements.wsStatus) return;
  elements.wsStatus.textContent = online ? 'Live-Updates aktiv' : 'Offline';
  elements.wsStatus.style.background = online ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)';
  elements.wsStatus.style.borderColor = online ? 'rgba(34,197,94,0.5)' : 'rgba(248,113,113,0.5)';
}

function updatePdfInfo(pdf) {
  if (!pdf) return;
  elements.pdfPath.textContent = pdf.path || '-';
  elements.pdfSize.textContent = pdf.exists ? formatBytes(pdf.size) : 'Nicht verfügbar';
  elements.pdfUpdated.textContent = pdf.modifiedAtISO ? formatDate(pdf.modifiedAtISO) : '-';
}

function updateTvStatus(tv) {
  if (!tv) return;
  elements.tvStatus.textContent = tv.available ? tv.status : 'CEC nicht verfügbar';
  elements.tvError.textContent = tv.error || '';
}

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    updatePdfInfo(data.pdf);
    updateTvStatus(data.tv);
    elements.uptime.textContent = formatUptime(data.uptimeSeconds);
    elements.serverTime.textContent = formatDate(data.timestamp);
    elements.hostName.textContent = data.hostname;
  } catch (error) {
    console.error('Status konnte nicht geladen werden', error);
  }
}

async function postAction(url) {
  try {
    const response = await fetch(url, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Aktion fehlgeschlagen');
    }
    if (data.status) {
      updateTvStatus(data.status);
    }
  } catch (error) {
    elements.tvError.textContent = error.message;
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    setWsStatus(true);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'pdf-update' || message.type === 'init') {
        updatePdfInfo(message.payload?.info || message.payload?.pdf);
      }
    } catch (err) {
      console.error('WebSocket-Nachricht ungültig', err);
    }
  };

  ws.onclose = () => {
    setWsStatus(false);
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function bootstrap() {
  fetchStatus();
  connectWebSocket();
  setInterval(fetchStatus, 30000);

  elements.reloadPdf.addEventListener('click', () => postAction('/api/pdf/reload'));
  elements.tvOn.addEventListener('click', () => postAction('/api/tv/on'));
  elements.tvOff.addEventListener('click', () => postAction('/api/tv/off'));
}

document.addEventListener('DOMContentLoaded', bootstrap);
