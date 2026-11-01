// Checks the pipeline end to end.
//   npm run smoke                        free calls only (templates, climate, search, recommender)
//   npm run smoke -- --photo me.jpg      also runs the YouCam detectors (spends units, then cached)
//     add --left l.jpg --right r.jpg (45° views) for hair type and frizz; --set male|female|any
//   npm run smoke -- --photo me.jpg --try female_curly_bob   plus one try-on
import '../server/env.js';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import * as pipeline from '../server/pipeline.js';
import { recommend } from '../server/recommend.js';
import { STYLES } from '../server/styles.js';
import * as local from '../server/local.js';
import { savePhoto } from '../server/cache.js';

const { values: args } = parseArgs({
  options: {
    photo: { type: 'string' }, left: { type: 'string' }, right: { type: 'string' },
    city: { type: 'string', default: 'Taipei' }, set: { type: 'string', default: 'any' }, try: { type: 'string' },
  },
});

const step = async (name, fn) => {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`✔ ${name} (${Date.now() - t}ms)`);
    return out;
  } catch (err) {
    console.log(`✘ ${name}: ${err.message}${err.code ? ` [${err.code}]` : ''}`);
  }
};

const templates = await step('YouCam hair-style templates', () => pipeline.templates('hair-style'));
if (templates) {
  const ids = new Set(templates.map((t) => t.id));
  const missing = STYLES.filter((s) => !ids.has(s.id)).map((s) => s.id);
  console.log(`  ${templates.length} templates; styles.js ids missing upstream: ${missing.join(', ') || 'none'}`);
}
for (const f of ['hair-curl', 'hair-vol', 'hair-ext']) await step(`YouCam ${f} templates`, () => pipeline.templates(f));

const climate = await step(`Climate for ${args.city}`, () => local.climate(args.city));
console.log(' ', climate);

let profile = {
  faceShape: 'Round', gender: 'female', hairType: { mapping: '2a to 2b', term: 'Slight to Medium Wavy' },
  hairLength: 'above chest', frizziness: { mapping: 2, term: 'Frizzy' }, hairDensity: 'Low Density',
};
let photoId;
const store = async (file) => file && savePhoto(await readFile(file), file.endsWith('.png') ? 'image/png' : 'image/jpeg');
if (args.photo) {
  photoId = await store(args.photo);
  const sides = { leftPhotoId: await store(args.left), rightPhotoId: await store(args.right) };
  profile = (await step('Analyze photo (YouCam detectors)', () => pipeline.analyze(photoId, sides))) ?? profile;
}
console.log('  profile:', JSON.stringify(profile));

const recs = recommend(profile, climate, { upkeep: 2, set: args.set });
console.log(`✔ Recommend (${recs.set})`);
for (const s of recs.styles) console.log(`  ${s.score.toFixed(1).padStart(5)}  ${s.templateId}  +${s.pros.length}/-${s.cons.length}  ${s.cons.join('; ')}`);

const stylists = await step('Tavily stylists', () => local.stylists({ city: args.city, style: 'curly bob', hairType: profile.hairType?.term }));
stylists?.results.slice(0, 3).forEach((r) => console.log(`  ${r.title} — ${r.url}`));
const products = await step('Tavily products', () => local.products({ ...profile, hairType: profile.hairType?.term, frizziness: profile.frizziness?.term, density: profile.hairDensity, frizzRisk: climate?.frizzRisk }));
products?.results.slice(0, 3).forEach((r) => console.log(`  ${r.title} — ${r.url}`));

if (photoId && args.try) {
  const out = await step(`Try on ${args.try}`, () => pipeline.generate(photoId, 'hair-style', { template_id: args.try }));
  if (out) console.log(`  result photo ${out.photoId} → http://localhost:3000${out.url}`);
}
