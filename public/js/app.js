const elements = {
  pdfPath: document.getElementById('pdfPath'),
  pdfSize: document.getElementById('pdfSize'),
  pdfUpdated: document.getElementById('pdfUpdated'),
  tvStatus: document.getElementById('tvStatus'),
  tvError: document.getElementById('tvError'),
  tvDevices: document.getElementById('tvDeviceList'),
  uptime: document.getElementById('uptime'),
  serverTime: document.getElementById('serverTime'),
  hostName: document.getElementById('hostName'),
  wsStatus: document.getElementById('wsStatus'),
  reloadPdf: document.getElementById('reloadPdf'),
  reloadPage: document.getElementById('reloadPage'),
  tvOn: document.getElementById('tvOn'),
  tvOff: document.getElementById('tvOff'),
  cecControls: document.getElementById('cecControls'),
  customKeyForm: document.getElementById('customKeyForm'),
  customKeySelect: document.getElementById('customKeySelect'),
  customHold: document.getElementById('customHold'),
  customTarget: document.getElementById('customTarget'),
  sequenceForm: document.getElementById('sequenceForm'),
  sequenceKeys: document.getElementById('sequenceKeys'),
  sequenceDelay: document.getElementById('sequenceDelay'),
  sequenceTarget: document.getElementById('sequenceTarget'),
  vendorCommandForm: document.getElementById('vendorCommandForm'),
  vendorPayload: document.getElementById('vendorPayload'),
  vendorId: document.getElementById('vendorId'),
  vendorIncludeId: document.getElementById('vendorIncludeId'),
  vendorTarget: document.getElementById('vendorTarget'),
  tvActiveSource: document.getElementById('tvActiveSource'),
  tvRequestActiveSource: document.getElementById('tvRequestActiveSource'),
};

let ws;
const CEC_DEVICE_REFRESH_MS = 60 * 1000;

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

function renderCecDevices(data) {
  if (!elements.tvDevices) return;
  if (data?.error) {
    elements.tvDevices.innerHTML = `<div class="device-chip device-chip-error">${data.error}</div>`;
    return;
  }
  const devices = data?.devices || [];
  if (!devices.length) {
    elements.tvDevices.innerHTML = '<div class="device-chip device-chip-muted">Keine Geräte erkannt</div>';
    return;
  }
  const chips = devices
    .map((device) => {
      const labelParts = [];
      if (device.name) {
        labelParts.push(device.name.trim());
      }
      if (Number.isInteger(device.logicalAddress)) {
        labelParts.push(`#${device.logicalAddress}`);
      }
      const label = labelParts.length ? labelParts.join(' ') : 'Gerät';
      const details = [
        device.vendorName ? `Vendor: ${device.vendorName.trim()}` : null,
        device.osdName ? `OSD: ${device.osdName.trim()}` : null,
        device.powerStatus ? `Power: ${device.powerStatus}` : null,
      ]
        .filter(Boolean)
        .join(' • ');
      const meta = [
        device.cecVersion ? `CEC ${device.cecVersion}` : null,
        device.physicalAddress ? `Adresse ${device.physicalAddress}` : null,
      ]
        .filter(Boolean)
        .join(' • ');
      return `<div class="device-chip">
        <strong>${label}</strong>
        ${details ? `<span>${details}</span>` : ''}
        ${meta ? `<span>${meta}</span>` : ''}
      </div>`;
    })
    .join('');
  elements.tvDevices.innerHTML = chips;
}

function parseNumberInput(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
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

async function fetchCecDevices() {
  if (!elements.tvDevices) return;
  try {
    const response = await fetch('/api/cec/devices');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'CEC-Infos konnten nicht geladen werden');
    }
    renderCecDevices(data);
  } catch (error) {
    elements.tvDevices.innerHTML = `<div class="device-chip device-chip-error">${error.message}</div>`;
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

async function postJson(url, body = {}) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Aktion fehlgeschlagen');
    }
    if (data.status) {
      updateTvStatus(data.status);
    }
    elements.tvError.textContent = '';
    return data;
  } catch (error) {
    elements.tvError.textContent = error.message;
    throw error;
  }
}

function collectKeyOptions({ holdMs, target }) {
  const options = {};
  const parsedHold = parseNumberInput(holdMs);
  if (parsedHold !== undefined) {
    options.holdMs = parsedHold;
  }
  const parsedTarget = parseNumberInput(target);
  if (parsedTarget !== undefined) {
    options.target = parsedTarget;
  }
  return options;
}

async function sendKey(key, options = {}) {
  if (!key) {
    throw new Error('Key fehlt');
  }
  const payload = {
    key,
    ...collectKeyOptions(options),
  };
  return postJson('/api/tv/key', payload);
}

async function sendKeySequence(keys, options = {}) {
  if (!Array.isArray(keys) || !keys.length) {
    throw new Error('Key-Liste ist leer');
  }
  const payload = {
    keys,
  };
  const parsedDelay = parseNumberInput(options.delayMs);
  if (parsedDelay !== undefined) {
    payload.delayMs = parsedDelay;
  }
  const parsedTarget = parseNumberInput(options.target);
  if (parsedTarget !== undefined) {
    payload.target = parsedTarget;
  }
  return postJson('/api/tv/key-sequence', payload);
}

async function sendVendorCommand(payload, { includeVendorId = true, vendorId, target } = {}) {
  const body = {
    payload,
  };
  if (includeVendorId === false) {
    body.includeVendorId = false;
  }
  if (includeVendorId !== false && vendorId) {
    body.vendorId = vendorId;
  }
  const parsedTarget = parseNumberInput(target);
  if (parsedTarget !== undefined) {
    body.target = parsedTarget;
  }
  return postJson('/api/tv/vendor-command', body);
}

function parseKeysInput(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
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

function initCecControls() {
  if (!elements.cecControls) return;

  elements.cecControls.addEventListener('click', (event) => {
    const keyButton = event.target.closest('[data-cec-key]');
    if (!keyButton) return;
    event.preventDefault();
    const key = keyButton.getAttribute('data-cec-key');
    if (!key) return;
    sendKey(key).catch(() => {});
  });

  if (elements.customKeyForm) {
    elements.customKeyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = elements.customKeySelect?.value || '';
      sendKey(key, {
        holdMs: elements.customHold?.value,
        target: elements.customTarget?.value,
      }).catch(() => {});
    });
  }

  if (elements.sequenceForm) {
    elements.sequenceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const keys = parseKeysInput(elements.sequenceKeys?.value);
      if (!keys.length) {
        elements.tvError.textContent = 'Bitte mindestens einen Key eingeben.';
        return;
      }
      sendKeySequence(keys, {
        delayMs: elements.sequenceDelay?.value,
        target: elements.sequenceTarget?.value,
      }).catch(() => {});
    });
  }

  if (elements.vendorCommandForm) {
    elements.vendorCommandForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const payload = elements.vendorPayload?.value?.trim();
      if (!payload) {
        elements.tvError.textContent = 'Bitte Payload eingeben.';
        return;
      }
      sendVendorCommand(payload, {
        includeVendorId: elements.vendorIncludeId ? elements.vendorIncludeId.checked : true,
        vendorId: elements.vendorId?.value,
        target: elements.vendorTarget?.value,
      }).catch(() => {});
    });
  }

  if (elements.tvActiveSource) {
    elements.tvActiveSource.addEventListener('click', () => {
      postJson('/api/tv/active-source', {}).catch(() => {});
    });
  }

  if (elements.tvRequestActiveSource) {
    elements.tvRequestActiveSource.addEventListener('click', () => {
      postJson('/api/tv/active-source/request', {}).catch(() => {});
    });
  }
}

function bootstrap() {
  fetchStatus();
  connectWebSocket();
  setInterval(fetchStatus, 30000);

  elements.reloadPdf.addEventListener('click', () => postAction('/api/pdf/reload'));
  if (elements.reloadPage) {
    elements.reloadPage.addEventListener('click', () => postAction('/api/display/reload'));
  }
  elements.tvOn.addEventListener('click', () => postAction('/api/tv/on'));
  elements.tvOff.addEventListener('click', () => postAction('/api/tv/off'));
  initCecControls();
  fetchCecDevices();
  setInterval(fetchCecDevices, CEC_DEVICE_REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', bootstrap);
