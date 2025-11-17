const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

const express = require('express');
const WebSocket = require('ws');

const config = require('./config.json');
const CecController = require('./cec-controller');
const { createPdfMonitor, getPdfInfo } = require('./pdf-monitor');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Set();
let currentPdfInfo = null;
let lastPdfEvent = null;

const cecController = new CecController({
  logicalAddress: config.cec?.logicalAddress ?? 0,
});

function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, payload });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

async function refreshPdfInfo(reason = 'manual') {
  currentPdfInfo = await getPdfInfo(config.pdfPath);
  lastPdfEvent = {
    reason,
    timestamp: new Date().toISOString(),
  };
  broadcast('pdf-update', { info: currentPdfInfo, reason });
  return currentPdfInfo;
}

async function getTvStatusSafe() {
  const status = await cecController.getPowerStatus();
  return status;
}

wss.on('connection', (socket) => {
  wsClients.add(socket);

  socket.on('close', () => {
    wsClients.delete(socket);
  });

  socket.send(
    JSON.stringify({
      type: 'init',
      payload: {
        pdf: currentPdfInfo,
        lastPdfEvent,
      },
    })
  );
});

createPdfMonitor(config.pdfPath, async (eventType) => {
  await refreshPdfInfo(eventType);
});

app.get('/api/status', async (req, res) => {
  const tv = await getTvStatusSafe();
  res.json({
    hostname: os.hostname(),
    uptimeSeconds: process.uptime(),
    pdf: currentPdfInfo,
    lastPdfEvent,
    tv,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/pdf/info', async (req, res) => {
  if (!currentPdfInfo) {
    await refreshPdfInfo('initial');
  }
  res.json({ pdf: currentPdfInfo, lastPdfEvent });
});

app.post('/api/pdf/reload', async (req, res) => {
  const info = await refreshPdfInfo('manual');
  res.json({ pdf: info });
});

app.post('/api/tv/on', async (req, res) => {
  try {
    const result = await cecController.turnOn();
    const status = await getTvStatusSafe();
    res.json({ success: true, result, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tv/off', async (req, res) => {
  try {
    const result = await cecController.turnOff();
    const status = await getTvStatusSafe();
    res.json({ success: true, result, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/pdf/latest', (req, res) => {
  const absolutePath = path.resolve(config.pdfPath);
  fs.access(absolutePath, fs.constants.R_OK, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'PDF nicht gefunden' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.sendFile(absolutePath);
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/pdf')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = config.port || 3000;

(async () => {
  await refreshPdfInfo('startup');
  server.listen(PORT, () => {
    console.log(`Signage-Server läuft auf Port ${PORT}`);
  });
})();
