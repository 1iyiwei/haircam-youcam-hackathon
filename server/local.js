// Local context: climate and live web search for stylists and products (Tavily).
// The keyless weather and geocoding services rate-limit or block shared cloud IPs
// (e.g. Render's), so each lookup falls back to a second provider.
import { memo, keyOf } from './cache.js';
import { fetchRetry } from './net.js';

const HOUR = 3600_000;
// Nominatim and MET Norway require an identifying User-Agent.
const UA = { 'User-Agent': 'HairCam/1.0 (+https://github.com/1iyiwei/haircam-youcam-hackathon)' };

async function getJson(url, init) {
  // Weather lookups and searches have no side effects.
  const res = await fetchRetry(url, init, { idempotent: true });
  if (!res.ok) throw new Error(`${new URL(url).host} request failed (${res.status})`);
  return res.json();
}

/** The first provider that succeeds; logs the ones that fail. */
async function firstOf(what, providers) {
  const errors = [];
  for (const [name, run] of providers) {
    try {
      const value = await run();
      if (value) return value;
      errors.push(`${name}: no result`);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  console.error(`${what} failed: ${errors.join('; ')}`);
  return null;
}

/**
 * Average humidity and dew point for the next 7 days. Humidity alone misleads in
 * cold places, so dew point drives the frizz risk: above ~18°C hair pulls in moisture.
 */
export function climate(city) {
  return memo(keyOf('climate', city.toLowerCase()), async () => {
    const place = await firstOf(`Geocoding "${city}"`, [
      ['open-meteo', async () => {
        const p = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1' })}`)).results?.[0];
        return p && { latitude: p.latitude, longitude: p.longitude, parts: [p.name, p.admin1, p.country] };
      }],
      ['photon', async () => {
        const f = (await getJson(`https://photon.komoot.io/api/?${new URLSearchParams({ q: city, limit: '1', lang: 'en' })}`, { headers: UA })).features?.[0];
        const p = f?.properties;
        return f && { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], parts: [p.name, p.state, p.country] };
      }],
    ]);
    if (!place) throw Object.assign(new Error(`Could not find "${city}"`), { status: 404 });
    const name = [...new Set(place.parts.filter(Boolean))].join(', ');
    return forecast(place.latitude, place.longitude, name);
  }, 6 * HOUR);
}

/** Same as climate(), for a shared location (e.g. a Telegram location pin). */
export function climateAt(latitude, longitude, name) {
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  return memo(keyOf('climateAt', lat, lon), async () => {
    const wx = await forecast(lat, lon, name);
    if (name) return wx;
    // Reverse geocoding: nearest named place, for captions and stylist searches.
    const city = await firstOf(`Reverse geocoding ${lat},${lon}`, [
      ['nominatim', async () => {
        const params = new URLSearchParams({ lat, lon, format: 'json', zoom: '10', 'accept-language': 'en' });
        const a = (await getJson(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: UA })).address;
        return a && [a.city || a.town || a.village || a.county, a.state, a.country];
      }],
      ['photon', async () => {
        const p = (await getJson(`https://photon.komoot.io/reverse?${new URLSearchParams({ lat, lon, lang: 'en' })}`, { headers: UA })).features?.[0]?.properties;
        return p && [p.city || p.town || p.village || p.county || p.district, p.state, p.country];
      }],
    ]);
    return { ...wx, city: [...new Set((city || []).filter(Boolean))].join(', ') || `${lat}, ${lon}` };
  }, 6 * HOUR);
}

async function forecast(latitude, longitude, city) {
  const hours = await firstOf(`Forecast for ${city || `${latitude},${longitude}`}`, [
    ['open-meteo', async () => {
      const params = new URLSearchParams({
        latitude,
        longitude,
        hourly: 'relative_humidity_2m,dew_point_2m,temperature_2m',
        forecast_days: '7',
        timezone: 'auto',
      });
      const { hourly: h } = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
      return { humidity: h.relative_humidity_2m, dewPoint: h.dew_point_2m, temperature: h.temperature_2m };
    }],
    ['met.no', async () => {
      const params = new URLSearchParams({ lat: latitude, lon: longitude });
      const data = await getJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?${params}`, { headers: UA });
      const until = Date.now() + 7 * 24 * HOUR;
      const d = data.properties.timeseries.filter((t) => Date.parse(t.time) < until).map((t) => t.data.instant.details);
      return { humidity: d.map((x) => x.relative_humidity), dewPoint: d.map((x) => x.dew_point_temperature), temperature: d.map((x) => x.air_temperature) };
    }],
  ]);
  if (!hours) throw Object.assign(new Error('Weather service unavailable'), { status: 503 });
  const avg = (xs) => {
    const ok = xs.filter((x) => typeof x === 'number');
    return ok.reduce((a, b) => a + b, 0) / ok.length;
  };
  const humidity = Math.round(avg(hours.humidity));
  const dewPoint = Math.round(avg(hours.dewPoint) * 10) / 10;
  const temperature = Math.round(avg(hours.temperature) * 10) / 10;
  const frizzRisk = dewPoint >= 18 ? 'high' : dewPoint >= 10 ? 'medium' : 'low';
  return { city, humidity, dewPoint, temperature, frizzRisk };
}

async function tavily(query, { maxResults = 6, ...opts } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY is not set');
  return memo(keyOf('tavily', query, maxResults, opts), async () => {
    const data = await getJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: maxResults, include_answer: true, ...opts }),
    });
    return {
      query,
      answer: data.answer,
      results: (data.results || []).map(({ title, url, content }) => ({ title, url, snippet: content })),
    };
  }, 24 * HOUR);
}

/** Salons near `city` that are good at this style and hair texture. */
export function stylists({ city, style, hairType }) {
  const texture = hairType ? `${hairType.toLowerCase()} hair ` : '';
  return tavily(`best hair salons in ${city} for ${texture}${style || 'haircuts'}: prices and online booking`);
}

/** Care products for this hair profile and climate. */
export function products({ hairType, frizziness, density, frizzRisk, style }) {
  const needs = [
    hairType && `${hairType.toLowerCase()} hair`,
    density && /low/i.test(density) && 'fine thin hair volume',
    (frizzRisk === 'high' || /frizzy/i.test(frizziness || '')) && !/not/i.test(frizziness || '') && 'anti-frizz humidity',
  ].filter(Boolean);
  const look = style ? ` to maintain a ${style.toLowerCase()} look` : '';
  return tavily(`best shampoo, conditioner and styling products for ${needs.join(', ') || 'healthy hair'}${look} to buy online`, {
    topic: 'general',
  });
}
