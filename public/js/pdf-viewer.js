const pdfFrame = document.getElementById('pdfFrame');
const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');
const pdfStatus = document.getElementById('pdfStatus');

function updateClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  clockDate.textContent = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function refreshPdfLabel(info) {
  if (!info) {
    pdfStatus.textContent = 'PDF: unbekannt';
    return;
  }
  if (!info.exists) {
    pdfStatus.textContent = 'PDF fehlt';
    return;
  }
  const timestamp = info.modifiedAtISO ? new Date(info.modifiedAtISO).toLocaleString('de-DE') : 'bereit';
  pdfStatus.textContent = `PDF: ${timestamp}`;
}

function reloadPdf() {
  const ts = Date.now();
  pdfFrame.setAttribute('src', `/pdf/latest?ts=${ts}`);
}

async function fetchInitialPdfInfo() {
  try {
    const response = await fetch('/api/pdf/info');
    const data = await response.json();
    refreshPdfLabel(data.pdf);
  } catch (error) {
    console.error('PDF-Info konnte nicht geladen werden', error);
  }
}

function connectWs() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket verbunden');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'pdf-update') {
        refreshPdfLabel(message.payload?.info);
        reloadPdf();
      } else if (message.type === 'init') {
        refreshPdfLabel(message.payload?.pdf);
      }
    } catch (error) {
      console.error('WS-Fehler', error);
    }
  };

  ws.onclose = () => {
    console.warn('WebSocket getrennt, neuer Versuch in 5s');
    setTimeout(connectWs, 5000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function initDisplay() {
  updateClock();
  setInterval(updateClock, 1000);
  fetchInitialPdfInfo();
  reloadPdf();
  connectWs();
}

document.addEventListener('DOMContentLoaded', initDisplay);
