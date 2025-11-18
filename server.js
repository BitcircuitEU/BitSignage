const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');

const express = require('express');
const WebSocket = require('ws');

const config = require('./config.json');
const CecController = require('./cec-controller');
const { createPdfMonitor, getPdfInfo } = require('./pdf-monitor');
const { getUpcomingEvents } = require('./events');
const { getWeatherWarnings } = require('./warnings');

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeVendorIdInput(value) {
  if (!value && value !== 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  const sanitized = text.replace(/[^0-9a-f]/gi, '');
  if (!sanitized) {
    return undefined;
  }
  const parts = sanitized.match(/.{1,2}/g);
  return parts && parts.length ? parts.slice(0, 3) : undefined;
}

function ensurePayloadProvided(payload) {
  if (payload === undefined || payload === null) {
    return false;
  }
  if (typeof payload === 'string') {
    return payload.trim().length > 0;
  }
  if (Array.isArray(payload)) {
    return payload.length > 0;
  }
  if (typeof payload === 'number') {
    return true;
  }
  return false;
}

const DEFAULT_SAMSUNG_VENDOR_ID = ['00', '00', 'F0'];

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Set();
let currentPdfInfo = null;
let lastPdfEvent = null;
let weatherCache = {
  data: null,
  timestamp: 0,
};
let cecDevicesCache = {
  data: null,
  timestamp: 0,
};

const weatherConfig = {
  lat: config.weather?.lat ?? 52.31,
  lon: config.weather?.lon ?? 7.58,
  timezone: config.weather?.timezone || 'auto',
  name: config.weather?.name || 'Standort',
  cacheMinutes: config.weather?.cacheMinutes ?? 10,
};
const weatherCacheMs = Math.max(weatherConfig.cacheMinutes, 1) * 60 * 1000;
const CEC_DEVICE_CACHE_MS = 30 * 1000;

const cecController = new CecController({
  logicalAddress: config.cec?.logicalAddress ?? config.cec?.targetAddress ?? 0,
  targetAddress: config.cec?.targetAddress ?? config.cec?.logicalAddress ?? 0,
  sourceAddress: config.cec?.sourceAddress,
  physicalAddress: config.cec?.physicalAddress,
  keyMap: config.cec?.keyMap,
});

function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, payload });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function fetchWeatherFromApi() {
  const params = new URLSearchParams({
    latitude: weatherConfig.lat,
    longitude: weatherConfig.lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    forecast_days: '7',
    timezone: weatherConfig.timezone || 'auto',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            return reject(new Error(`Open-Meteo Fehler (${response.statusCode})`));
          }
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function getWeather(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && weatherCache.data && now - weatherCache.timestamp < weatherCacheMs) {
    return weatherCache.data;
  }
  const freshData = await fetchWeatherFromApi();
  freshData.name = weatherConfig.name;
  weatherCache = {
    data: freshData,
    timestamp: now,
  };
  return freshData;
}

async function getCecDevices(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cecDevicesCache.data && now - cecDevicesCache.timestamp < CEC_DEVICE_CACHE_MS) {
    return cecDevicesCache.data;
  }
  try {
    const result = await cecController.scanDevices();
    const payload = {
      devices: result.devices,
      fetchedAt: new Date().toISOString(),
    };
    cecDevicesCache = {
      data: payload,
      timestamp: now,
    };
    return payload;
  } catch (error) {
    const payload = {
      devices: [],
      error: error.message,
      fetchedAt: new Date().toISOString(),
    };
    cecDevicesCache = {
      data: payload,
      timestamp: now,
    };
    return payload;
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

app.post('/api/display/reload', (req, res) => {
  broadcast('display-reload', {
    reason: 'manual',
    timestamp: new Date().toISOString(),
  });
  res.json({ success: true });
});

app.get('/api/events', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const events = await getUpcomingEvents({ limit });
    res.json({
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/warnings', async (req, res) => {
  try {
    const warnings = await getWeatherWarnings(req.query.force === '1');
    res.json(warnings);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/weather', async (req, res) => {
  try {
    const weather = await getWeather(req.query.force === '1');
    res.json({
      weather,
      cachedAt: weatherCache.timestamp,
      location: {
        latitude: weatherConfig.lat,
        longitude: weatherConfig.lon,
        timezone: weatherConfig.timezone || 'auto',
        name: weatherConfig.name,
      },
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/cec/devices', async (req, res) => {
  try {
    const info = await getCecDevices(req.query.force === '1');
    res.json(info);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
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

app.post('/api/tv/key', async (req, res) => {
  const { key, holdMs, target } = req.body ?? {};
  if (!key) {
    return res.status(400).json({ success: false, error: 'Parameter "key" fehlt.' });
  }
  const options = {};
  const parsedHoldMs = parseOptionalNumber(holdMs);
  if (parsedHoldMs !== undefined) {
    options.holdMs = parsedHoldMs;
  }
  const parsedTarget = parseOptionalNumber(target);
  if (parsedTarget !== undefined) {
    options.target = parsedTarget;
  }
  try {
    const result = await cecController.sendKey(key, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tv/key-sequence', async (req, res) => {
  const { keys, delayMs, target } = req.body ?? {};
  if (!Array.isArray(keys) || !keys.length) {
    return res
      .status(400)
      .json({ success: false, error: 'keys muss ein nicht-leeres Array sein.' });
  }
  const options = {};
  const parsedDelay = parseOptionalNumber(delayMs);
  if (parsedDelay !== undefined) {
    options.delayMs = parsedDelay;
  }
  const parsedTarget = parseOptionalNumber(target);
  if (parsedTarget !== undefined) {
    options.target = parsedTarget;
  }
  try {
    const result = await cecController.sendKeySequence(keys, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tv/active-source', async (req, res) => {
  const { physicalAddress } = req.body ?? {};
  try {
    const result = await cecController.setActiveSource(physicalAddress);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tv/active-source/request', async (req, res) => {
  try {
    const result = await cecController.requestActiveSource();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tv/vendor-command', async (req, res) => {
  const { payload, includeVendorId = true, vendorId, target } = req.body ?? {};
  if (!ensurePayloadProvided(payload)) {
    return res.status(400).json({
      success: false,
      error: 'payload muss angegeben werden (String, Array oder Bytewert).',
    });
  }

  const options = {};
  const parsedTarget = parseOptionalNumber(target);
  if (parsedTarget !== undefined) {
    options.target = parsedTarget;
  }

  if (includeVendorId !== false) {
    const normalizedVendorId =
      normalizeVendorIdInput(vendorId) ?? DEFAULT_SAMSUNG_VENDOR_ID;
    options.vendorId = normalizedVendorId;
  }

  try {
    const method =
      includeVendorId === false
        ? cecController.sendVendorCommand.bind(cecController)
        : cecController.sendVendorCommandWithId.bind(cecController);
    const result = await method(payload, options);
    res.json({ success: true, result });
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
