const https = require('https');
const config = require('./config.json');

const WARN_BASE_URL = 'https://app-prod-ws.warnwetter.de/v30';
const LEVEL_LABELS = {
  1: 'Hinweis',
  2: 'Wetterwarnung',
  3: 'Markante Warnung',
  4: 'Unwetterwarnung',
  5: 'Extreme Unwetterwarnung',
};

const warningCache = {
  data: null,
  timestamp: 0,
};

const cacheMs = Math.max(config.warnings?.cacheMinutes ?? 5, 1) * 60 * 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`WarnWetter Fehler (${res.statusCode})`));
          }
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', (error) => reject(error));
  });
}

async function fetchPointWarnings(point) {
  const url = `${WARN_BASE_URL}/pointWarnings?point=${encodeURIComponent(point)}`;
  return fetchJson(url);
}

function normalizeWarning(raw, point) {
  const start = raw.start ? new Date(raw.start) : null;
  const end = raw.end ? new Date(raw.end) : null;
  return {
    id: raw.warnId || raw.id || `${point}-${raw.event}-${raw.start || Date.now()}`,
    point,
    event: raw.event || 'Warnung',
    headline: raw.headLine || raw.headline || raw.event || 'Warnung',
    description: raw.descriptionText || raw.description || '',
    instruction: raw.instruction || '',
    level: raw.level || 0,
    levelLabel: LEVEL_LABELS[raw.level] || 'Info',
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
  };
}

async function getWeatherWarnings(forceRefresh = false) {
  const points = config.warnings?.points || [];
  if (!points.length) {
    return { warnings: [], fetchedAt: new Date().toISOString() };
  }

  if (!forceRefresh && warningCache.data && Date.now() - warningCache.timestamp < cacheMs) {
    return warningCache.data;
  }

  const results = await Promise.allSettled(points.map((point) => fetchPointWarnings(point.trim())));
  const now = Date.now();
  const warnings = [];

  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return;
    }
    const pointWarnings = result.value?.warnings || [];
    pointWarnings.forEach((warn) => {
      const normalized = normalizeWarning(warn, points[index]);
      const endTime = normalized.end ? new Date(normalized.end).getTime() : now;
      if (endTime >= now) {
        warnings.push(normalized);
      }
    });
  });

  warnings.sort((a, b) => {
    const aStart = a.start ? new Date(a.start).getTime() : now;
    const bStart = b.start ? new Date(b.start).getTime() : now;
    return aStart - bStart;
  });

  const payload = {
    warnings,
    fetchedAt: new Date().toISOString(),
  };

  warningCache.data = payload;
  warningCache.timestamp = Date.now();

  return payload;
}

module.exports = {
  getWeatherWarnings,
};

