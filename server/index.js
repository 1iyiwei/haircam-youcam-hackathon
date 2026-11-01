import './env.js';
import express from 'express';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { savePhoto, photoFile } from './cache.js';
import * as pipeline from './pipeline.js';
import { recommend } from './recommend.js';
import * as local from './local.js';
import { startTelegram } from './telegram.js';

const app = express();

// Optional shared passcode (HTTP Basic auth, any username) so a public deployment
// can't spend the YouCam units. Off when APP_PASSCODE is unset.
const PASSCODE = process.env.APP_PASSCODE;
if (PASSCODE) {
  const expected = Buffer.from(PASSCODE);
  app.use((req, res, next) => {
    if (req.path === '/healthz') return next();
    const [scheme, encoded] = (req.get('authorization') || '').split(' ');
    const given = Buffer.from(scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="HairCam", charset="UTF-8"').status(401).send('Passcode required');
  });
}
app.get('/healthz', (req, res) => res.send('ok'));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.resolve('public')));

// Wraps async handlers so thrown errors become JSON responses.
const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    console.error(`${req.method} ${req.path}:`, err.message);
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: err.message, code: err.code });
  }
};

const need = (obj, ...keys) => {
  for (const k of keys) if (obj?.[k] == null || obj[k] === '') throw Object.assign(new Error(`Missing ${k}`), { status: 400 });
};

// Body is the raw image (the browser resizes it to <= 2048px first).
app.post(
  '/api/photos',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }),
  route(async (req) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw Object.assign(new Error('Send a JPEG/PNG body'), { status: 400 });
    const photoId = await savePhoto(req.body, req.get('content-type'));
    return { photoId, url: `/api/photos/${photoId}` };
  }),
);

app.get('/api/photos/:id', async (req, res) => {
  try {
    const file = await photoFile(req.params.id);
    res.sendFile(file.path, { headers: { 'Content-Type': file.contentType }, maxAge: '1y', immutable: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/analyze', route(async (req) => {
  need(req.body, 'photoId');
  return pipeline.analyze(req.body.photoId, req.body);
}));

app.get('/api/motions', (req, res) =>
  res.json(Object.entries(pipeline.MOTIONS).map(([id, m]) => ({ id, label: m.label }))),
);

app.get('/api/templates/:feature', route((req) => pipeline.templates(req.params.feature)));

app.post('/api/recommend', route(async (req) => {
  need(req.body, 'profile');
  const { profile, prefs = {} } = req.body;
  const climate = req.body.climate ?? (prefs.city ? await local.climate(prefs.city) : undefined);
  return { climate, ...recommend(profile, climate, prefs) };
}));

app.post('/api/generate', route(async (req) => {
  need(req.body, 'photoId', 'feature');
  return pipeline.generate(req.body.photoId, req.body.feature, req.body.params);
}));

app.post('/api/humid-day', route(async (req) => {
  need(req.body, 'photoId', 'profile', 'climate');
  return pipeline.humidDay(req.body.photoId, req.body.profile, req.body.climate);
}));

app.post('/api/grow-out', route(async (req) => {
  need(req.body, 'photoId');
  return pipeline.growOut(req.body.photoId);
}));

// Video takes 5-8 minutes, longer than proxies and phones like to hold a request open.
// The first POST starts the job; it and later POSTs wait up to 20 s, then answer
// 202 { pending } so the client polls again. A failure is reported once, then forgotten.
const videoJobs = new Map();

// Costs more units than an image; only runs when the user asks.
app.post('/api/animate', route(async (req, res) => {
  need(req.body, 'photoId');
  const { photoId, motion = 'calm' } = req.body;
  const key = `${photoId}:${motion}`;
  let job = videoJobs.get(key);
  if (!job) {
    job = {};
    job.done = pipeline.animate(photoId, { motion }).then((r) => (job.result = r), (e) => (job.error = e));
    videoJobs.set(key, job);
  }
  await Promise.race([job.done, new Promise((r) => setTimeout(r, 20_000))]);
  if (job.error) {
    videoJobs.delete(key);
    throw job.error;
  }
  if (job.result) {
    videoJobs.delete(key); // cached on disk from here on
    return job.result;
  }
  res.status(202);
  return { pending: true };
}));

app.get('/api/climate', route(async (req) => {
  need(req.query, 'city');
  return local.climate(req.query.city);
}));

app.get('/api/stylists', route(async (req) => {
  need(req.query, 'city');
  return local.stylists(req.query);
}));

app.get('/api/products', route((req) => local.products(req.query)));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`HairCam on http://localhost:${port}`));

// Only one process may poll a bot: set TELEGRAM_POLLING=off locally while Render runs it.
if (process.env.TELEGRAM_POLLING !== 'off') startTelegram().catch((err) => console.error('Telegram:', err.message));
