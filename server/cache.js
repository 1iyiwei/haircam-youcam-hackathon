// Disk cache so repeated demos don't burn YouCam units, and generated images
// outlive YouCam's ~2h download links. Uploads and results share one photo store.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CACHE_DIR = path.resolve(process.env.CACHE_DIR || 'cache');
const DIRS = { json: 'json', photos: 'photos' };

export const hash = (data) => createHash('sha256').update(data).digest('hex');
export const keyOf = (...parts) => hash(JSON.stringify(parts)).slice(0, 32);

async function ensure(dir) {
  const full = path.join(CACHE_DIR, dir);
  await mkdir(full, { recursive: true });
  return full;
}

export async function getJson(key, maxAgeMs = Infinity) {
  try {
    const entry = JSON.parse(await readFile(path.join(CACHE_DIR, DIRS.json, `${key}.json`), 'utf8'));
    return Date.now() - entry.savedAt <= maxAgeMs ? entry.value : undefined;
  } catch {
    return undefined;
  }
}

export async function setJson(key, value) {
  const dir = await ensure(DIRS.json);
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify({ savedAt: Date.now(), value }));
  return value;
}

const inFlight = new Map();

/**
 * Returns the cached value, or computes, stores and returns it. Concurrent calls
 * with the same key share one computation, so a YouCam task never runs twice.
 */
export function memo(key, compute, maxAgeMs) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    const hit = await getJson(key, maxAgeMs);
    if (hit !== undefined) return hit;
    return setJson(key, await compute());
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export async function savePhoto(buffer, contentType) {
  const id = hash(buffer).slice(0, 24);
  const dir = await ensure(DIRS.photos);
  await writeFile(path.join(dir, `${id}.bin`), buffer);
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ contentType }));
  return id;
}

export async function loadPhoto(id) {
  if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Invalid photo id');
  const dir = path.join(CACHE_DIR, DIRS.photos);
  const buffer = await readFile(path.join(dir, `${id}.bin`)).catch(() => {
    throw Object.assign(new Error('Unknown photo id'), { status: 404 });
  });
  const { contentType } = JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'));
  return { buffer, contentType };
}

/** Downloads a result image into the photo store so it can be chained into further tasks. */
export async function downloadPhoto(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Downloading result image failed (${res.status})`);
  const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  return savePhoto(Buffer.from(await res.arrayBuffer()), contentType);
}
