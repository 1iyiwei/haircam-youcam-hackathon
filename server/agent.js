// The HairCam stylist: an LLM that chats with the customer and drives the YouCam
// pipeline through tools. Independent of the chat channel; adapters (Telegram, web)
// pass in user input and an `io` object for sending media.
import * as pipeline from './pipeline.js';
import { recommend } from './recommend.js';
import * as local from './local.js';
import { chat } from './llm.js';

const SYSTEM = `You are HairCam, a warm, expert hairstylist chatting with a customer in a messaging app.
Your goal: help them pick a haircut they will be happy living with, show it on their own photo, then help them get it (stylists, products).

How to run the consultation:
- Chat like a stylist: short messages (1-3 sentences), one question at a time, friendly, no jargon. Reply in the customer's language. Plain text only, no Markdown.
- Find out, in a natural order: what they want (a change? a specific look? a reference photo?), a selfie, where they live (city or a shared location), lifestyle (work, sports, how much daily styling they accept), and whether to show masculine, feminine or all styles. Never assume gender; ask.
- Selfie tips: face the camera straight on, face filling about half to most of the photo width, hairline visible. Optional extra: one photo with the head turned ~45° left and one ~45° right, which unlocks hair type and frizz detection.
- Use tools for every fact about their hair, weather, styles, stylists and products. Never invent results. Explain results in plain words.
- When recommending, mention 2-3 options with the key reason for each, including how long a cut would take to grow back if it is a big chop.
- After a try-on, offer next steps: a typical humid day in their city, how it grows out, a short video of it moving (takes 5-8 minutes; it arrives later in the chat), bangs or a new color, local stylists, products.
- Use suggest_replies to offer 2-4 quick answers when a question has obvious choices, and ask_location when asking where they live.
- Photos arrive as references like photo1, photo2. Decide from context whether a photo is their selfie, a side view, or a reference look they want; ask if unclear.
- If a tool reports a photo problem, relay the tip and ask for a new photo.`;

const COLOR_PRESETS = [
  'Jet Black', 'Chocolate Brown', 'Honey Blonde', 'Platinum Blonde', 'Ash Gray', 'Rose Gold', 'Burgundy', 'Copper Red',
  'Lavender', 'Teal Blue', 'Dark Brown/Caramel Blonde', 'Jet Black/Silver Gray', 'Ash Brown/Lavender',
  'Rose Gold/Peach Blonde', 'Burgundy/Magenta Pink', 'Deep Blue/Teal Green', 'Plum Purple/Pastel Lilac',
  'Copper Red/Golden Blonde', 'Dark Gray/Ice Blonde', 'Midnight Blue/Denim Blue',
];

const PHOTO_TIPS = {
  needs_side_photos: 'Hair type and frizz need two more photos: head turned about 45° left, and about 45° right.',
  error_face_position_too_small: 'The face is too small: move closer so the face fills about half the photo width.',
  error_face_angle_invalid: 'Face the camera straight on (for side photos, turn about 45°).',
  error_large_face_angle: 'Face the camera straight on.',
  error_no_face: 'No face found: use a well-lit, unobstructed photo.',
  error_multiple_people: 'Only one person should be in the photo.',
  error_hair_too_short: 'The hair is too short for this effect.',
};
const tip = (err) => PHOTO_TIPS[err.code] || err.message;

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const photoRef = { type: 'string', description: 'Photo reference such as photo1' };
const styleSet = { type: 'string', enum: ['male', 'female', 'any'], description: 'Which hairstyle set the customer wants' };

const TOOLS = [
  fn('analyze_photos', 'Analyze the customer: face shape, hair length, density; with left and right 45° photos also hair type and frizz. Run before recommending.', { front: photoRef, left: photoRef, right: photoRef }, ['front']),
  fn('get_climate', "7-day humidity, dew point and frizz risk. Uses the customer's shared location if no city is given.", { city: { type: 'string' } }),
  fn('recommend_styles', 'Rank hairstyles for the analyzed customer, their climate and lifestyle. Returns template ids, pros and cons.', {
    style_set: styleSet,
    max_upkeep: { type: 'integer', enum: [1, 2, 3], description: '1 wash-and-go, 2 some styling, 3 daily styling is fine' },
    sports: { type: 'boolean', description: 'Customer does sports or works out regularly' },
  }, ['style_set']),
  fn('browse_styles', 'Search the hairstyle catalog by words (e.g. "bob", "curly", "braids") to find template ids for a look the customer describes.', { style_set: styleSet, query: { type: 'string' } }, ['style_set']),
  fn('try_on', 'Render a hairstyle template on the customer\'s selfie and send the image to them.', { template_id: { type: 'string' } }, ['template_id']),
  fn('try_on_reference', 'Copy the hairstyle from a reference photo (a look the customer likes) onto their selfie and send it.', { reference: photoRef }, ['reference']),
  fn('try_color', 'Recolor the hair of the current look (or the original selfie) and send it.', {
    preset: { type: 'string', enum: COLOR_PRESETS },
    on: { type: 'string', enum: ['current_look', 'original'] },
  }, ['preset']),
  fn('try_bangs', 'Add bangs to the current look and send it.', {
    template_id: { type: 'string', description: 'Bang template, e.g. female_wispy_bangs, male_mini_fringe, female_blunt_bangs, female_left_side_swept' },
  }, ['template_id']),
  fn('humid_day', 'Show the current look on a typical day in the customer\'s climate (humidity adds volume and frizz). Needs get_climate first.'),
  fn('grow_out', 'Show the current look at three successively longer grow-out stages.'),
  fn('make_video', 'Start a 5-second video of the current look moving. Takes 5-8 minutes; it is sent to the customer automatically when ready.', {
    motion: { type: 'string', enum: Object.keys(pipeline.MOTIONS), description: 'calm head turn shows the sides; lively; windy; active is a workout head shake' },
  }, ['motion']),
  fn('find_stylists', 'Search local salons good at the current look and the customer\'s hair type. Needs a city or location.'),
  fn('find_products', 'Search hair-care and styling products for the customer\'s hair, climate and current look.'),
  fn('suggest_replies', 'Show quick-reply buttons under your next message.', {
    options: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    ask_location: { type: 'boolean', description: 'Add a "share my location" button' },
  }, ['options']),
];

export function newSession() {
  return { messages: [], photos: {}, nPhotos: 0, location: null, profile: null, climate: null, set: null, look: null, videos: {} };
}

/** Records a photo the customer sent and returns its reference (photo1, photo2, ...). */
function addPhoto(session, photoId) {
  const ref = `photo${++session.nPhotos}`;
  session.photos[ref] = photoId;
  return ref;
}

const photo = (session, ref) => {
  const id = session.photos[ref];
  if (!id) throw Object.assign(new Error(`Unknown photo ${ref}`), { code: 'unknown_photo' });
  return id;
};
const needSelfie = (s) => {
  if (!s.front) throw new Error('No selfie analyzed yet: ask for a selfie and run analyze_photos first');
  return s.front;
};
const lookPhoto = (s) => s.look?.photoId || needSelfie(s);

let styleTitles;
async function titles() {
  styleTitles ??= Object.fromEntries((await pipeline.templates('hair-style')).map((t) => [t.id, t.title]));
  return styleTitles;
}

function summarizeProfile(p) {
  const tips = [...new Set(Object.values(p.errors || {}).map(tip))];
  return {
    face_shape: p.faceShape,
    hair_length: p.hairLength,
    hair_density: p.hairDensity,
    hair_type: p.hairType?.term,
    frizziness: p.frizziness?.term,
    hair_color: p.hairColor,
    ...(tips.length && { photo_tips: tips }),
  };
}

/** Tool implementations. Each returns a JSON-able result for the LLM; media go out through io. */
const handlers = {
  async analyze_photos(s, { front, left, right }) {
    const profile = await pipeline.analyze(photo(s, front), {
      leftPhotoId: left && photo(s, left),
      rightPhotoId: right && photo(s, right),
    });
    if (profile.errors?.face && profile.errors?.hairLength) {
      return { error: 'Could not read this photo', photo_tips: [tip(profile.errors.face)] };
    }
    s.front = profile.photoId;
    s.profile = profile;
    s.look = null;
    return summarizeProfile(profile);
  },

  async get_climate(s, { city }) {
    if (city) s.climate = await local.climate(city);
    else if (s.location) s.climate = await local.climateAt(s.location.latitude, s.location.longitude);
    else return { error: 'No city or shared location yet' };
    return s.climate;
  },

  async recommend_styles(s, { style_set, max_upkeep = 2, sports = false }) {
    if (!s.profile) return { error: 'Analyze a selfie first' };
    s.set = style_set;
    const names = await titles();
    const { styles } = recommend(s.profile, s.climate, { set: style_set, upkeep: max_upkeep, active: sports, limit: 5 });
    return styles.map((r) => ({
      template_id: r.templateId,
      title: names[r.templateId] || r.templateId,
      pros: r.pros,
      cons: r.cons,
      months_to_grow_back: r.regrowMonths,
    }));
  },

  async browse_styles(s, { style_set, query = '' }) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = await pipeline.templates('hair-style');
    return all
      .filter((t) => style_set === 'any' || t.id.startsWith(`${style_set}_`))
      .filter((t) => words.every((w) => `${t.title} ${t.id}`.toLowerCase().includes(w)))
      .slice(0, 12)
      .map((t) => ({ template_id: t.id, title: t.title }));
  },

  async try_on(s, { template_id }, io) {
    const out = await pipeline.generate(needSelfie(s), 'hair-style', { template_id });
    const title = (await titles())[template_id] || template_id;
    s.look = { photoId: out.photoId, title };
    await io.send({ type: 'photo', photoId: out.photoId, caption: title });
    return { sent: true, look: title };
  },

  async try_on_reference(s, { reference }, io) {
    const out = await pipeline.generate(needSelfie(s), 'hair-transfer', { refPhotoId: photo(s, reference) });
    s.look = { photoId: out.photoId, title: 'your reference look' };
    await io.send({ type: 'photo', photoId: out.photoId, caption: 'Your reference look, on you' });
    return { sent: true };
  },

  async try_color(s, { preset, on = 'current_look' }, io) {
    const base = on === 'original' ? needSelfie(s) : lookPhoto(s);
    const out = await pipeline.generate(base, 'hair-color', { preset });
    const title = on === 'original' || !s.look ? `${preset} hair` : `${s.look.title}, ${preset}`;
    s.look = { photoId: out.photoId, title };
    await io.send({ type: 'photo', photoId: out.photoId, caption: title });
    return { sent: true, look: title };
  },

  async try_bangs(s, { template_id }, io) {
    const out = await pipeline.generate(lookPhoto(s), 'hair-bang', { template_id });
    const title = `${s.look?.title || 'Your hair'} with bangs`;
    s.look = { photoId: out.photoId, title };
    await io.send({ type: 'photo', photoId: out.photoId, caption: title });
    return { sent: true, look: title };
  },

  async humid_day(s, _, io) {
    if (!s.climate) return { error: 'Get the climate first' };
    const out = await pipeline.humidDay(lookPhoto(s), s.profile || {}, s.climate);
    const place = s.climate.city.split(',')[0];
    if (!out.final) return { frizz_risk: s.climate.frizzRisk, note: `Low frizz risk in ${place}: it should look like salon day` };
    await io.send({ type: 'photo', photoId: out.final.photoId, caption: `A typical day in ${place} (${s.climate.humidity}% humidity)` });
    return { sent: true, frizz_risk: s.climate.frizzRisk };
  },

  async grow_out(s, _, io) {
    const stages = await pipeline.growOut(lookPhoto(s));
    const ok = stages.filter((st) => !st.error);
    if (!ok.length) return { error: stages.map((st) => PHOTO_TIPS[st.code] || st.error).join('; ') };
    await io.send({ type: 'album', photoIds: ok.map((st) => st.photoId), caption: 'Growing out, stage by stage' });
    return { sent: true, stages: ok.length };
  },

  async make_video(s, { motion }, io) {
    const base = lookPhoto(s);
    const label = pipeline.MOTIONS[motion].label;
    const key = `${base}:${motion}`;
    if (s.videos[key] === 'pending') return { status: 'already in progress' };
    s.videos[key] = 'pending';
    // Runs in the background; the adapter delivers the result into the chat later.
    pipeline.animate(base, { motion }).then(
      (out) => {
        s.videos[key] = out.photoId;
        io.later({ type: 'video', photoId: out.photoId, caption: `${s.look?.title || 'Your look'}: ${label.toLowerCase()}` }, `The ${label} video is ready and was sent.`);
      },
      (err) => {
        delete s.videos[key];
        io.later({ type: 'text', text: `Sorry, the ${label} video failed: ${tip(err)}` }, `The ${label} video failed.`);
      },
    );
    return { status: 'started', eta: '5-8 minutes' };
  },

  async find_stylists(s) {
    const city = s.climate?.city;
    if (!city) return { error: 'Need a city or shared location first' };
    const r = await local.stylists({ city, style: s.look?.title, hairType: s.profile?.hairType?.term });
    return { summary: r.answer, results: r.results.slice(0, 5).map(({ title, url }) => ({ title, url })) };
  },

  async find_products(s) {
    const p = s.profile || {};
    const r = await local.products({
      hairType: p.hairType?.term,
      frizziness: p.frizziness?.term,
      density: p.hairDensity,
      frizzRisk: s.climate?.frizzRisk,
      style: s.look?.title,
    });
    return { summary: r.answer, results: r.results.slice(0, 5).map(({ title, url }) => ({ title, url })) };
  },

  async suggest_replies(s, { options, ask_location }, io) {
    io.replies = { options, askLocation: !!ask_location };
    return { shown: true };
  },
};

// Keep the context small: the tail of the conversation, starting at a user message.
function history(messages, max = 60) {
  let start = Math.max(0, messages.length - max);
  while (start < messages.length && messages[start].role !== 'user') start++;
  return messages.slice(start);
}

/**
 * Runs one customer turn. `input` is { text?, photoId?, location? }.
 * `io` provides send(item) for immediate media, later(item, note) for background
 * results, and receives io.replies (quick-reply buttons) for the final message.
 * Returns the stylist's reply text.
 */
export async function turn(session, input, io) {
  const parts = [];
  if (input.photoId) parts.push(`[sent ${addPhoto(session, input.photoId)}]`);
  if (input.location) {
    session.location = input.location;
    parts.push('[shared their location]');
  }
  if (input.text) parts.push(input.text);
  session.messages.push({ role: 'user', content: parts.join(' ') });

  for (let round = 0; round < 10; round++) {
    const msg = await chat([{ role: 'system', content: SYSTEM }, ...history(session.messages)], TOOLS);
    session.messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls && { tool_calls: msg.tool_calls }) });
    if (!msg.tool_calls?.length) return msg.content || '';
    for (const call of msg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        io.working?.(call.function.name);
        result = await handlers[call.function.name](session, args, io);
      } catch (err) {
        console.error(`tool ${call.function.name}:`, err.message);
        result = { error: tip(err) };
      }
      session.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return "Sorry, I got a bit tangled up there. Could you say that again?";
}

/** Notes a background result in the conversation so the stylist knows about it. */
export function note(session, text) {
  session.messages.push({ role: 'system', content: text });
}
