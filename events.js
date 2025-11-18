const https = require('https');
const config = require('./config.json');

const HOLIDAY_API_BASE = 'https://feiertage-api.de/api';
const STATE_CODE = config.holidays?.state || 'NW';
const HOLIDAY_CACHE_MS = Math.max(config.holidays?.cacheHours ?? 12, 1) * 60 * 60 * 1000;

const holidayCache = new Map(); // year -> { timestamp, data }

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
            return reject(new Error(`Holiday API Fehler (${res.statusCode})`));
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

async function fetchHolidayYear(year) {
  const cached = holidayCache.get(year);
  if (cached && Date.now() - cached.timestamp < HOLIDAY_CACHE_MS) {
    return cached.data;
  }
  const url = `${HOLIDAY_API_BASE}/?jahr=${year}&nur_land=${STATE_CODE}`;
  const apiResponse = await fetchJson(url);
  const normalized = Object.entries(apiResponse || {}).map(([title, info]) => ({
    title,
    description: info?.hinweis || '',
    date: info?.datum,
    category: 'holiday',
  }));
  holidayCache.set(year, { data: normalized, timestamp: Date.now() });
  return normalized;
}

function normalizeCustomEvents() {
  const custom = config.events || [];
  return custom
    .map((entry) => {
      if (!entry?.date || !entry?.title) {
        return null;
      }
      const parsed = new Date(entry.date);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return {
        title: entry.title,
        description: entry.description || '',
        category: entry.category || 'event',
        date: entry.date,
      };
    })
    .filter(Boolean);
}

function toDate(dateString) {
  if (!dateString) {
    return null;
  }
  const parsed = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getUpcomingEvents({ referenceDate = new Date(), limit = 10 } = {}) {
  const startOfDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const horizon = new Date(startOfDay);
  horizon.setMonth(horizon.getMonth() + 3);

  const currentYear = startOfDay.getFullYear();
  const years = [currentYear];
  if (startOfDay.getMonth() >= 10) {
    years.push(currentYear + 1);
  }
  const holidayBatches = await Promise.all(years.map(fetchHolidayYear));
  const customEvents = normalizeCustomEvents();

  const combined = [...holidayBatches.flat(), ...customEvents]
    .map((event) => {
      const eventDate = toDate(event.date);
      if (!eventDate) {
        return null;
      }
      return {
        title: event.title,
        description: event.description,
        category: event.category,
        eventDate,
        date: toIsoDate(eventDate),
      };
    })
    .filter((event) => event && event.eventDate >= startOfDay && event.eventDate < horizon)
    .sort((a, b) => a.eventDate - b.eventDate)
    .slice(0, limit)
    .map(({ title, description, category, date }) => ({
      title,
      description,
      category,
      date,
    }));

  return combined;
}

module.exports = {
  getUpcomingEvents,
};
