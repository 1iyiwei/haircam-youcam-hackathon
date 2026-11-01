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

// Photo-quality errors (face too small, wrong angle, ...) won't change on retry, so they
// are cached like results; transient failures are not.
async function detect(feature, body) {
  const out = await memo(keyOf('detect', feature, body), () =>
    youcam.runTask(feature, body).catch((err) => {
      if (err.code?.startsWith('error_') && err.code !== 'error_inference') return { error: { message: err.message, code: err.code } };
      throw err;
    }),
  );
  if (out.error) throw new youcam.YouCamError(out.error.message, { code: out.error.code, feature });
  return out;
}

/**
 * Builds a hair profile from a front selfie. Hair type and frizziness need three
 * views (left 45°, front, right 45°) and are skipped without the side photos.
 * Costs one task per detector on first run; cached afterwards.
 */
export async function analyze(photoId, { leftPhotoId, rightPhotoId } = {}) {
  const angles = leftPhotoId && rightPhotoId ? [leftPhotoId, photoId, rightPhotoId] : null;
  const ids = (feature) => Promise.all(angles.map((id) => fileIdFor(id, feature)));

  const jobs = {
    face: async () =>
      detect('face-attr-analysis', {
        src_file_id: await fileIdFor(photoId, 'face-attr-analysis'),
        features: ['faceShape', 'age', 'gender', 'hairColor'],
      }),
    hairLength: async () =>
      detect('hair-length-detection', { src_file_id: await fileIdFor(photoId, 'hair-length-detection') }),
    density: async () =>
      detect('hair-density-detection', { src_file_id: await fileIdFor(photoId, 'hair-density-detection') }),
  };
  if (angles) {
    jobs.hairType = async () => detect('hair-type-detection', { src_file_ids: await ids('hair-type-detection') });
    jobs.frizziness = async () => detect('hair-frizziness-detection', { src_file_ids: await ids('hair-frizziness-detection') });
  }

  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map((n) => jobs[n]()));
  const raw = {};
  const errors = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') raw[names[i]] = r.value;
    else errors[names[i]] = { message: r.reason.message, code: r.reason.code };
  });
  if (!angles) {
    const skipped = { message: 'Add left and right 45° photos to detect this', code: 'needs_side_photos' };
    errors.hairType = errors.frizziness = skipped;
  }

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

// A slow head turn shows the cut from the sides, which a still try-on can't.
const MOTION_PROMPT =
  'The person slowly turns their head about 30 degrees to the left, then about 30 degrees to the right, ' +
  'then back to face the camera. Calm, steady motion. The hair stays neatly in place and moves only with the head. ' +
  'Keep the face, hairstyle, hair color and background unchanged.';
const MOTION_NEGATIVE =
  'wind, hair blowing, hair flipping, fast motion, shaking, changing hairstyle, changing hair color, distorted face, extra people, low quality';

/** Short video of a (try-on) photo, via YouCam AI Image to Video Generator V2. */
export function animate(photoId, { duration = 5, resolution = 480 } = {}) {
  const feature = 'image-to-video/youcam';
  return memo(keyOf('animate', photoId, duration, resolution, MOTION_PROMPT), async () => {
    const result = await youcam.runTask(
      feature,
      {
        src_file_id: await fileIdFor(photoId, feature),
        model: 'youcam-video-v2',
        resolution: String(resolution), // the API rejects a numeric resolution
        dst_duration: duration,
        prompt: MOTION_PROMPT,
        negative_prompt: MOTION_NEGATIVE,
      },
      { intervalMs: 5000, timeoutMs: 15 * 60_000 }, // typically takes 5-8 minutes
    );
    const videoId = await downloadPhoto(result.url, 'video/mp4');
    return { photoId: videoId, url: `/api/photos/${videoId}`, sourcePhotoId: photoId, duration, resolution };
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
