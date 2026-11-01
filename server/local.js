// Local context: climate (Open-Meteo, numeric and keyless) and live web search
// for stylists and products (Tavily).
import { memo, keyOf } from './cache.js';

const HOUR = 3600_000;

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${new URL(url).host} request failed (${res.status})`);
  return res.json();
}

/**
 * Average humidity and dew point for the next 7 days. Humidity alone misleads in
 * cold places, so dew point drives the frizz risk: above ~18°C hair pulls in moisture.
 */
export function climate(city) {
  return memo(keyOf('climate', city.toLowerCase()), async () => {
    const geo = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1' })}`,
    );
    const place = geo.results?.[0];
    if (!place) throw Object.assign(new Error(`Could not find "${city}"`), { status: 404 });
    const name = [...new Set([place.name, place.admin1, place.country].filter(Boolean))].join(', ');
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
    const geo = await getJson(
      `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat, lon, format: 'json', zoom: '10', 'accept-language': 'en' })}`,
      { headers: { 'User-Agent': 'HairCam hackathon demo' } },
    ).catch(() => null);
    const a = geo?.address || {};
    const city = [a.city || a.town || a.village || a.county, a.state, a.country].filter(Boolean);
    return { ...wx, city: [...new Set(city)].join(', ') || `${lat}, ${lon}` };
  }, 6 * HOUR);
}

async function forecast(latitude, longitude, city) {
  const wx = await getJson(
    `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
      latitude,
      longitude,
      hourly: 'relative_humidity_2m,dew_point_2m,temperature_2m',
      forecast_days: '7',
      timezone: 'auto',
    })}`,
  );
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const humidity = Math.round(avg(wx.hourly.relative_humidity_2m));
  const dewPoint = Math.round(avg(wx.hourly.dew_point_2m) * 10) / 10;
  const temperature = Math.round(avg(wx.hourly.temperature_2m) * 10) / 10;
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
