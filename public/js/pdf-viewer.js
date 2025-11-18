const pdfFrame = document.getElementById('pdfFrame');
const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');
const weatherElements = {
  location: document.getElementById('weatherLocation'),
  updated: document.getElementById('weatherUpdated'),
  temp: document.getElementById('weatherTemp'),
  desc: document.getElementById('weatherDesc'),
  feels: document.getElementById('weatherFeels'),
  high: document.getElementById('weatherHigh'),
  low: document.getElementById('weatherLow'),
  humidity: document.getElementById('weatherHumidity'),
  icon: document.getElementById('weatherIcon'),
  forecast: document.getElementById('weatherForecast'),
  warnings: document.getElementById('weatherWarnings'),
};
const eventElements = {
  list: document.getElementById('eventList'),
};
const PDF_BASE_PATH = '/pdf/latest';
const PDF_VIEW_FRAGMENT = '#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=Fit';
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const WARNINGS_REFRESH_MS = 5 * 60 * 1000;
const EVENTS_REFRESH_MS = 60 * 60 * 1000;
const WEATHER_CODE_DESCRIPTIONS = {
  0: 'Klarer Himmel',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bewölkt',
  45: 'Nebel',
  48: 'Reifiger Nebel',
  51: 'Leichter Sprühregen',
  53: 'Mäßiger Sprühregen',
  55: 'Starker Sprühregen',
  56: 'Gefrierender Sprühregen',
  57: 'Gefrierender Sprühregen',
  61: 'Leichter Regen',
  63: 'Mäßiger Regen',
  65: 'Starker Regen',
  66: 'Gefrierender Regen',
  67: 'Gefrierender Regen',
  71: 'Leichter Schneefall',
  73: 'Mäßiger Schneefall',
  75: 'Starker Schneefall',
  77: 'Schneekörner',
  80: 'Leichte Regenschauer',
  81: 'Mäßige Regenschauer',
  82: 'Heftige Regenschauer',
  85: 'Leichte Schneeschauer',
  86: 'Heftige Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit Hagel',
  99: 'Starkes Gewitter mit Hagel',
};

function buildPdfSrc(timestamp) {
  const cacheBuster = typeof timestamp === 'number' ? `?ts=${timestamp}` : '';
  return `${PDF_BASE_PATH}${cacheBuster}${PDF_VIEW_FRAGMENT}`;
}

function updateClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  clockDate.textContent = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function reloadPdf() {
  const ts = Date.now();
  pdfFrame.setAttribute('src', buildPdfSrc(ts));
}

function formatTemp(value) {
  if (value === undefined || value === null) {
    return '--°';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--°';
  }
  return `${Math.round(numeric)}°`;
}

function describeWeather(code) {
  if (code === undefined || code === null) {
    return 'Keine Daten';
  }
  return WEATHER_CODE_DESCRIPTIONS[code] || 'Unbekannter Zustand';
}

function formatPrecip(value, unit = 'mm') {
  if (value === undefined || value === null) {
    return `0 ${unit}`;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `0 ${unit}`;
  }
  return `${numeric.toFixed(numeric >= 10 ? 0 : 1)} ${unit}`;
}

function buildForecastItems(daily = {}, units = {}) {
  const days = daily.time || [];
  const maxTemps = daily.temperature_2m_max || [];
  const minTemps = daily.temperature_2m_min || [];
  const precip = daily.precipitation_sum || [];
  const precipProb = daily.precipitation_probability_max || [];
  const precipUnit = units.precipitation_sum || 'mm';
  return days.map((isoDate, idx) => {
    const date = isoDate ? new Date(`${isoDate}T00:00:00`) : null;
    const label = date
      ? date.toLocaleDateString('de-DE', { weekday: 'short' })
      : `Tag ${idx + 1}`;
    return {
      label,
      tempMax: formatTemp(maxTemps[idx]),
      tempMin: formatTemp(minTemps[idx]),
      precip: formatPrecip(precip[idx], precipUnit),
      precipProb: precipProb[idx] != null ? `${precipProb[idx]}%` : '--%',
    };
  });
}

function renderForecastList(daily, units) {
  if (!weatherElements.forecast) {
    return;
  }
  const items = buildForecastItems(daily, units);
  if (!items.length) {
    weatherElements.forecast.innerHTML = '<div class="forecast-item">Keine Daten</div>';
    return;
  }
  const entries = items
    .slice(0, 7)
    .map(
      (item) =>
        `<div class="forecast-item">
          <div class="label">${item.label}</div>
          <div class="details">
            <span>${item.precip} • ${item.precipProb}</span>
            <span>${item.tempMin} / ${item.tempMax}</span>
          </div>
        </div>`
    )
    .join('');
  weatherElements.forecast.innerHTML = entries;
}

function updateWeatherCard(weather) {
  if (!weather) {
    return;
  }
  const current = weather.current || {};
  const daily = weather.daily || {};
  const dailyUnits = weather.daily_units || {};
  if (weatherElements.location) {
    weatherElements.location.textContent = weather.name || 'Hörstel';
  }
  if (weatherElements.updated) {
    const updated = current.time ? new Date(current.time) : new Date();
    weatherElements.updated.textContent = updated.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (weatherElements.temp) {
    weatherElements.temp.textContent = formatTemp(current.temperature_2m);
  }
  if (weatherElements.desc) {
    weatherElements.desc.textContent = describeWeather(current.weather_code);
  }
  if (weatherElements.feels) {
    weatherElements.feels.textContent = `Gefühlt ${formatTemp(current.apparent_temperature)}`;
  }
  if (weatherElements.high) {
    weatherElements.high.textContent = `↑ ${formatTemp(daily.temperature_2m_max?.[0])}`;
  }
  if (weatherElements.low) {
    weatherElements.low.textContent = `↓ ${formatTemp(daily.temperature_2m_min?.[0])}`;
  }
  if (weatherElements.humidity) {
    const humidity = current.relative_humidity_2m;
    weatherElements.humidity.textContent =
      humidity === undefined || humidity === null ? '--%' : `${humidity}%`;
  }
  if (weatherElements.icon) {
    weatherElements.icon.hidden = true;
  }
  renderForecastList(daily, dailyUnits);
}

function setWeatherError(message) {
  if (weatherElements.desc) {
    weatherElements.desc.textContent = message;
  }
  if (weatherElements.temp) {
    weatherElements.temp.textContent = '--°';
  }
  if (weatherElements.icon) {
    weatherElements.icon.hidden = true;
  }
  if (weatherElements.forecast) {
    weatherElements.forecast.innerHTML = '<div class="forecast-item">Keine Daten</div>';
  }
}

function formatWarningTime(start, end) {
  if (!start && !end) {
    return '';
  }
  const date = start ? new Date(start) : new Date();
  const formatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endFormatter = end
    ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  if (endFormatter && end) {
    return `${formatter.format(date)} – ${endFormatter.format(new Date(end))}`;
  }
  return formatter.format(date);
}

function renderWarnings(warnings) {
  if (!weatherElements.warnings) {
    return;
  }
  if (!warnings || !warnings.length) {
    weatherElements.warnings.innerHTML =
      '<div class="warning-item no-warnings"><strong>Keine Warnungen</strong><span>Aktuell liegen keine Wetterwarnungen vor.</span></div>';
    return;
  }
  const items = warnings.slice(0, 4).map(
    (warning) => `
      <div class="warning-item">
        <strong>${warning.levelLabel || warning.event}</strong>
        <span>${warning.headline || warning.event}</span>
        <span>${formatWarningTime(warning.start, warning.end)}</span>
      </div>`
  );
  weatherElements.warnings.innerHTML = items.join('');
}

function renderEvents(events) {
  if (!eventElements.list) {
    return;
  }
  if (!events || !events.length) {
    eventElements.list.innerHTML = '<div class="event-item"><span class="label">Keine Termine</span></div>';
    return;
  }
  const formatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const items = events.slice(0, 5).map(
    (event) => `
      <div class="event-item">
        <span class="label">${event.title}</span>
        <span class="date">${formatter.format(new Date(`${event.date}T00:00:00`))}</span>
      </div>`
  );
  eventElements.list.innerHTML = items.join('');
}

async function fetchWeather() {
  if (!weatherElements.temp) {
    return;
  }
  try {
    const response = await fetch('/api/weather');
    if (!response.ok) {
      throw new Error('Antwort ungültig');
    }
    const data = await response.json();
    const payload = {
      ...data.weather,
      name: data.location?.name || data.weather?.name,
    };
    updateWeatherCard(payload);
  } catch (error) {
    console.error('Wetter konnte nicht geladen werden', error);
    setWeatherError('Wetter nicht verfügbar');
  }
}

async function fetchWarnings() {
  if (!weatherElements.warnings) {
    return;
  }
  try {
    const response = await fetch('/api/warnings');
    if (!response.ok) {
      throw new Error('Antwort ungültig');
    }
    const data = await response.json();
    renderWarnings(data.warnings || []);
  } catch (error) {
    console.error('Warnungen konnten nicht geladen werden', error);
    weatherElements.warnings.innerHTML = '<div class="warning-item">Warnungen nicht verfügbar</div>';
  }
}

async function fetchEvents() {
  if (!eventElements.list) {
    return;
  }
  try {
    const response = await fetch('/api/events');
    if (!response.ok) {
      throw new Error('Antwort ungültig');
    }
    const data = await response.json();
    renderEvents(data.events || []);
  } catch (error) {
    console.error('Events konnten nicht geladen werden', error);
    eventElements.list.innerHTML = '<div class="event-item"><span class="label">Keine Daten verfügbar</span></div>';
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
        reloadPdf();
      } else if (message.type === 'init' && message.payload?.pdf?.exists) {
        reloadPdf();
      } else if (message.type === 'display-reload') {
        window.location.reload();
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
  pdfFrame.setAttribute('src', buildPdfSrc());
  updateClock();
  setInterval(updateClock, 1000);
  reloadPdf();
  connectWs();
  fetchWeather();
  setInterval(fetchWeather, WEATHER_REFRESH_MS);
  fetchWarnings();
  setInterval(fetchWarnings, WARNINGS_REFRESH_MS);
  fetchEvents();
  setInterval(fetchEvents, EVENTS_REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', initDisplay);
