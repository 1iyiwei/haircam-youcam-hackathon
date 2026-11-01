const $ = (id) => document.getElementById(id);

const state = { photoId: null, leftPhotoId: null, rightPhotoId: null, profile: null, climate: null, tryOn: null, templates: {} };

// Tiny DOM builder; text is always set via textContent (search snippets are untrusted).
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(c));
  return node;
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function status(msg) {
  $('status').textContent = msg;
}

// Reports progress in the clicked button's own card, where the user is looking.
async function busy(button, msg, fn) {
  const card = button.closest('.card');
  const line = card.querySelector('.status') || card.appendChild(el('p', { className: 'status' }));
  button.disabled = true;
  line.textContent = msg;
  const start = Date.now();
  const timer = setInterval(() => {
    const secs = Math.round((Date.now() - start) / 1000);
    line.textContent = `${msg} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }, 1000);
  try {
    await fn();
    line.textContent = '';
  } catch (err) {
    line.textContent = `⚠️ ${err.message}`;
  } finally {
    clearInterval(timer);
    button.disabled = false;
  }
}

/** Downscales to YouCam's limits and re-encodes as JPEG. */
async function resize(file, maxSide = 2048) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = Object.assign(document.createElement('canvas'), {
    width: Math.round(bmp.width * scale),
    height: Math.round(bmp.height * scale),
  });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
}

// Front photo is required; left/right 45° views are optional extras for hair type and frizz.
const photoInputs = { photo: 'photoId', photoLeft: 'leftPhotoId', photoRight: 'rightPhotoId' };
for (const [input, key] of Object.entries(photoInputs)) {
  $(input).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    status('Uploading…');
    const blob = await resize(file);
    const res = await fetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const { photoId, url } = await res.json();
    state[key] = photoId;
    $(`${input}Preview`).src = url;
    $(`${input}Preview`).hidden = false;
    $('analyzeBtn').disabled = !state.photoId;
    status('');
  });
}

$('analyzeBtn').addEventListener('click', (e) =>
  busy(e.target, 'Analyzing face shape, hair type, length, frizz and density…', async () => {
    if (!$('set').value) throw new Error('Choose which styles to show');
    const city = $('city').value.trim();
    const [profile, climate] = await Promise.all([
      api('/api/analyze', { photoId: state.photoId, leftPhotoId: state.leftPhotoId, rightPhotoId: state.rightPhotoId }),
      city ? api(`/api/climate?city=${encodeURIComponent(city)}`) : null,
    ]);
    state.profile = profile;
    state.climate = climate;
    renderProfile();
    status('Picking styles…');
    await renderRecs();
  }),
);

// Plain-language fixes for the YouCam detector errors we see most.
const PHOTO_TIPS = {
  needs_side_photos: 'Add left and right 45° photos to detect hair type and frizz.',
  error_face_position_too_small: 'Move closer: your face should fill about half the photo width.',
  error_face_angle_invalid: 'Face the camera straight on (side photos: turn about 45°).',
  error_large_face_angle: 'Face the camera straight on.',
  error_no_face: 'No face found; use a well-lit, unobstructed selfie.',
  error_multiple_people: 'Only one person should be in the photo.',
};

function renderProfile() {
  const p = state.profile;
  const rows = [
    ['Face shape', p.faceShape],
    ['Hair type', p.hairType && `${p.hairType.term} (${p.hairType.mapping})`],
    ['Length', p.hairLength],
    ['Frizz', p.frizziness?.term],
    ['Density', p.hairDensity],
    ['Hair color', p.hairColor],
  ];
  $('profile').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v ?? '—')]));
  const tips = [...new Set(Object.values(p.errors || {}).map((e) => PHOTO_TIPS[e.code] || e.message))];
  if (tips.length) $('profile').append(el('dt', {}, 'To improve'), el('dd', { className: 'con' }, tips.join(' ')));
  const c = state.climate;
  $('climate').textContent = c
    ? `${c.city}: ${c.humidity}% humidity, dew point ${c.dewPoint}°C over the next week → ${c.frizzRisk} frizz risk.`
    : 'Add a city to factor in your local humidity.';
  $('profileCard').hidden = false;
}

async function templateInfo(id) {
  if (!state.templates['hair-style']) {
    const list = await api('/api/templates/hair-style');
    state.templates['hair-style'] = Object.fromEntries(list.map((t) => [t.id, t]));
  }
  return state.templates['hair-style'][id] || { id, title: id };
}

async function renderRecs() {
  const prefs = { set: $('set').value, upkeep: Number($('upkeep').value), active: $('active').checked };
  const { styles } = await api('/api/recommend', { profile: state.profile, climate: state.climate, prefs });
  const cards = await Promise.all(
    styles.map(async (s) => {
      const t = await templateInfo(s.templateId);
      const btn = el('button', { onclick: (e) => tryOn(e.target, s, t) }, 'Try it on');
      return el('div', { className: 'style' },
        el('img', { src: t.thumb || '', alt: t.title, loading: 'lazy' }),
        el('h3', {}, t.title),
        el('ul', {}, s.pros.map((x) => el('li', { className: 'pro' }, x)), s.cons.map((x) => el('li', { className: 'con' }, x))),
        btn,
      );
    }),
  );
  $('recs').replaceChildren(...cards);
  $('recsCard').hidden = false;
}

function tryOn(button, style, template) {
  return busy(button, `Rendering ${template.title} on you…`, async () => {
    const out = await api('/api/generate', { photoId: state.photoId, feature: 'hair-style', params: { template_id: style.templateId } });
    state.tryOn = { ...out, style, template };
    $('before').src = `/api/photos/${state.photoId}`;
    $('after').src = out.url;
    $('afterCaption').textContent = `${template.title}: salon day`;
    $('extra').replaceChildren();
    $('stylists').replaceChildren();
    $('products').replaceChildren();
    $('tryCard').hidden = false;
    $('tryCard').scrollIntoView({ behavior: 'smooth' });
  });
}

$('humidBtn').addEventListener('click', (e) =>
  busy(e.target, 'Simulating your humidity…', async () => {
    if (!state.climate) throw new Error('Add your city and analyze again to simulate humidity');
    const out = await api('/api/humid-day', { photoId: state.tryOn.photoId, profile: state.profile, climate: state.climate });
    const caption = out.final
      ? `${state.climate.city.split(',')[0]}, typical day (${state.climate.humidity}% RH)`
      : `Low frizz risk in ${state.climate.city.split(',')[0]}: should look like salon day`;
    $('extra').replaceChildren(figure(out.final?.url || state.tryOn.url, caption));
  }),
);

$('growBtn').addEventListener('click', (e) =>
  busy(e.target, 'Growing it out…', async () => {
    const stages = await api('/api/grow-out', { photoId: state.tryOn.photoId });
    $('extra').replaceChildren(
      ...stages.map((s) => (s.error ? el('p', { className: 'con' }, `Stage ${s.stage}: ${s.code || s.error}`) : figure(s.url, `Grow-out stage ${s.stage}`))),
    );
  }),
);

$('moveBtn').addEventListener('click', (e) =>
  busy(e.target, 'Filming a 5-second head turn (usually 5–8 minutes)…', async () => {
    const out = await api('/api/animate', { photoId: state.tryOn.photoId });
    const video = el('video', { src: out.url, controls: true, autoplay: true, loop: true, muted: true, playsInline: true });
    $('extra').replaceChildren(el('figure', {}, video, el('figcaption', {}, `${state.tryOn.template.title}, from every side`)));
  }),
);

$('stylistBtn').addEventListener('click', (e) =>
  busy(e.target, 'Searching local stylists…', async () => {
    const city = state.climate?.city || $('city').value.trim();
    if (!city) throw new Error('Add your city first');
    const q = new URLSearchParams({ city, style: state.tryOn.template.title, hairType: state.profile.hairType?.term || '' });
    $('stylists').replaceChildren(el('h3', {}, 'Stylists'), searchResults(await api(`/api/stylists?${q}`)));
  }),
);

$('productBtn').addEventListener('click', (e) =>
  busy(e.target, 'Searching products for your hair…', async () => {
    const p = state.profile;
    const q = new URLSearchParams({
      hairType: p.hairType?.term || '',
      frizziness: p.frizziness?.term || '',
      density: p.hairDensity || '',
      frizzRisk: state.climate?.frizzRisk || '',
      style: state.tryOn.template.title,
    });
    $('products').replaceChildren(el('h3', {}, 'Products'), searchResults(await api(`/api/products?${q}`)));
  }),
);

function figure(src, caption) {
  return el('figure', {}, el('img', { src, alt: caption }), el('figcaption', {}, caption));
}

function searchResults({ answer, results }) {
  return el('div', {},
    answer && el('p', {}, answer),
    results.map((r) => el('div', { className: 'result' }, el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title), el('p', {}, r.snippet?.slice(0, 220)))),
  );
}
