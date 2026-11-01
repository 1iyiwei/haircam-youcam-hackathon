// HairCam pipeline: analyze a selfie, try on styles, and chain effects onto results
// (humid-day preview, grow-out). Every YouCam call is cached by photo + parameters.
import * as youcam from './youcam.js';
import { memo, keyOf, loadPhoto, downloadPhoto } from './cache.js';
import { humidityEffects, GROW_OUT_STAGES } from './recommend.js';

const FILE_ID_MAX_AGE = 20 * 3600_000; // YouCam keeps uploads for 24h

/** Uploads a stored photo for a feature, reusing the file_id while it is still valid. */
function fileIdFor(photoId, feature) {
  return memo(keyOf('file', photoId, feature), async () => {
    const { buffer, contentType } = await loadPhoto(photoId);
    return youcam.uploadFile(feature, buffer, contentType);
  }, FILE_ID_MAX_AGE);
}

function detect(feature, body) {
  return memo(keyOf('detect', feature, body), () => youcam.runTask(feature, body));
}

/**
 * Builds a hair profile from one selfie. Hair type and frizziness ask for three
 * angles; with only one photo we send it three times.
 * Costs one task per detector on first run; cached afterwards.
 */
export async function analyze(photoId, anglePhotoIds = []) {
  const angles = [photoId, ...anglePhotoIds].concat([photoId, photoId]).slice(0, 3);
  const ids = (feature) => Promise.all(angles.map((id) => fileIdFor(id, feature)));

  const jobs = {
    face: async () =>
      detect('face-attr-analysis', {
        src_file_id: await fileIdFor(photoId, 'face-attr-analysis'),
        features: ['faceShape', 'age', 'gender', 'hairColor'],
      }),
    hairType: async () => detect('hair-type-detection', { src_file_ids: await ids('hair-type-detection') }),
    hairLength: async () =>
      detect('hair-length-detection', { src_file_id: await fileIdFor(photoId, 'hair-length-detection') }),
    frizziness: async () =>
      detect('hair-frizziness-detection', { src_file_ids: await ids('hair-frizziness-detection') }),
    density: async () =>
      detect('hair-density-detection', { src_file_id: await fileIdFor(photoId, 'hair-density-detection') }),
  };

  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map((n) => jobs[n]()));
  const raw = {};
  const errors = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') raw[names[i]] = r.value;
    else errors[names[i]] = { message: r.reason.message, code: r.reason.code };
  });

  const face = raw.face || {};
  return {
    photoId,
    faceShape: face.faceshape,
    age: face.agegender?.age,
    gender: face.agegender?.gender,
    hairColor: face.color?.hair_color_name,
    faceQuality: face.face_quality,
    hairType: raw.hairType?.hair_type, // { mapping: '2a to 2b', term: 'Slight to Medium Wavy' }
    hairLength: raw.hairLength?.hair_length?.term,
    frizziness: raw.frizziness?.hair_frizziness && {
      mapping: Number(raw.frizziness.hair_frizziness.mapping),
      term: raw.frizziness.hair_frizziness.term,
    },
    hairDensity: raw.density?.hair_density?.term,
    errors,
  };
}

const GENERATORS = new Set(['hair-style', 'hair-curl', 'hair-vol', 'hair-ext', 'hair-bang', 'hair-color', 'hair-transfer']);

/**
 * Runs one generative effect on a stored photo and stores the result as a new photo,
 * so results can be fed into further effects.
 * @param params  feature-specific fields: { template_id } for template features,
 *                { preset } / { palettes, pattern } for hair-color, { refPhotoId } for hair-transfer
 */
export function generate(photoId, feature, params = {}) {
  if (!GENERATORS.has(feature)) throw Object.assign(new Error(`Unsupported feature ${feature}`), { status: 400 });
  return memo(keyOf('generate', photoId, feature, params), async () => {
    const { refPhotoId, ...rest } = params;
    const body = { src_file_id: await fileIdFor(photoId, feature), ...rest };
    if (refPhotoId) body.ref_file_id = await fileIdFor(refPhotoId, feature);
    const result = await youcam.runTask(feature, body);
    const resultPhotoId = await downloadPhoto(result.url);
    return { photoId: resultPhotoId, url: `/api/photos/${resultPhotoId}`, feature, params, sourcePhotoId: photoId };
  });
}

/** Applies the climate's humidity effects on top of a (try-on) photo, step by step. */
export async function humidDay(photoId, profile, climate) {
  const steps = [];
  let current = photoId;
  for (const { feature, templateId } of humidityEffects(profile, climate)) {
    const out = await generate(current, feature, { template_id: templateId });
    steps.push(out);
    current = out.photoId;
  }
  return { frizzRisk: climate?.frizzRisk ?? 'unknown', steps, final: steps.at(-1) ?? null };
}

/** Grow-out previews: each stage is a progressively longer version of the same photo. */
export async function growOut(photoId) {
  const settled = await Promise.allSettled(
    GROW_OUT_STAGES.map((templateId) => generate(photoId, 'hair-ext', { template_id: templateId })),
  );
  return settled.map((r, i) =>
    r.status === 'fulfilled' ? { stage: i + 1, ...r.value } : { stage: i + 1, error: r.reason.message, code: r.reason.code },
  );
}

export const templates = (feature) => memo(keyOf('templates', feature), () => youcam.listTemplates(feature), 24 * 3600_000);
