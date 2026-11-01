// Telegram front end for the HairCam stylist: webhook when deployed, long polling locally.
// One conversation per chat; turns in a chat run one at a time.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CACHE_DIR, savePhoto, loadPhoto } from './cache.js';
import * as agent from './agent.js';
import { fetchRetry } from './net.js';

const TOKEN = () => process.env.YOUCAM_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const api = (method) => `https://api.telegram.org/bot${TOKEN()}/${method}`;

async function call(method, body) {
  const isForm = body instanceof FormData;
  const res = await fetchRetry(api(method), {
    method: 'POST',
    ...(isForm ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }, { idempotent: /^get/.test(method) });
  const json = await res.json();
  if (!json.ok) throw Object.assign(new Error(`Telegram ${method}: ${json.description}`), { code: json.error_code });
  return json.result;
}

// --- sessions, persisted next to the result cache -------------------------------

const SESSION_DIR = path.join(CACHE_DIR, 'sessions');
const sessions = new Map();

async function getSession(chatId) {
  if (!sessions.has(chatId)) {
    let s;
    try {
      s = JSON.parse(await readFile(path.join(SESSION_DIR, `${chatId}.json`), 'utf8'));
      // Background videos don't survive a restart.
      for (const [k, v] of Object.entries(s.videos || {})) if (v === 'pending') delete s.videos[k];
    } catch {
      s = agent.newSession();
    }
    sessions.set(chatId, s);
  }
  return sessions.get(chatId);
}

async function saveSession(chatId) {
  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(path.join(SESSION_DIR, `${chatId}.json`), JSON.stringify(sessions.get(chatId)));
}

// Serializes work per chat (customer turns and background video deliveries).
const queues = new Map();
function enqueue(chatId, job) {
  const next = (queues.get(chatId) || Promise.resolve()).then(job).catch((err) => console.error(`chat ${chatId}:`, err));
  queues.set(chatId, next);
  return next;
}

// --- sending -------------------------------------------------------------------

const keyboard = (replies) =>
  replies
    ? {
        keyboard: [
          ...replies.options.map((text) => [{ text }]),
          ...(replies.askLocation ? [[{ text: '📍 Share my location', request_location: true }]] : []),
        ],
        one_time_keyboard: true,
        resize_keyboard: true,
      }
    : { remove_keyboard: true };

async function sendText(chatId, text, replies) {
  // Telegram caps messages at 4096 characters.
  const chunks = text.match(/[\s\S]{1,4000}/g) || [];
  for (const [i, chunk] of chunks.entries()) {
    await call('sendMessage', {
      chat_id: chatId,
      text: chunk,
      link_preview_options: { is_disabled: true },
      ...(i === chunks.length - 1 && { reply_markup: keyboard(replies) }),
    });
  }
}

async function fileBlob(photoId) {
  const { buffer, contentType } = await loadPhoto(photoId);
  return new Blob([buffer], { type: contentType });
}

async function sendMedia(chatId, item) {
  const caption = item.caption?.slice(0, 1000);
  if (item.type === 'text') return sendText(chatId, item.text);
  if (item.type === 'album') {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set('media', JSON.stringify(item.photoIds.map((_, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 && { caption }) }))));
    for (const [i, id] of item.photoIds.entries()) form.set(`p${i}`, await fileBlob(id), `p${i}.jpg`);
    return call('sendMediaGroup', form);
  }
  const video = item.type === 'video';
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption);
  form.set(video ? 'video' : 'photo', await fileBlob(item.photoId), video ? 'haircam.mp4' : 'haircam.jpg');
  if (video) form.set('supports_streaming', 'true');
  return call(video ? 'sendVideo' : 'sendPhoto', form);
}

// Keeps "typing…" / "sending photo…" visible while a turn runs.
function showActivity(chatId) {
  let action = 'typing';
  const tick = () => call('sendChatAction', { chat_id: chatId, action }).catch(() => {});
  tick();
  const timer = setInterval(tick, 4500);
  return {
    set: (a) => {
      if (a !== action) (action = a), tick();
    },
    stop: () => clearInterval(timer),
  };
}

const MEDIA_TOOLS = new Set(['try_on', 'try_on_reference', 'try_color', 'try_bangs', 'humid_day', 'grow_out']);

// --- receiving -----------------------------------------------------------------

async function downloadTelegramFile(fileId, contentType = 'image/jpeg') {
  const file = await call('getFile', { file_id: fileId });
  const res = await fetchRetry(`https://api.telegram.org/file/bot${TOKEN()}/${file.file_path}`, undefined, { idempotent: true });
  if (!res.ok) throw new Error(`Downloading photo failed (${res.status})`);
  return savePhoto(Buffer.from(await res.arrayBuffer()), contentType);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const session = await getSession(chatId);
  const text = (msg.text ?? msg.caption ?? '').trim();

  // Optional passcode so a public bot can't spend the YouCam units.
  // Judges can use the deep link t.me/<bot>?start=<passcode>.
  const passcode = process.env.APP_PASSCODE;
  if (passcode && !session.authorized) {
    const given = text.replace(/^\/start\s*/, '').trim();
    if (given !== passcode) {
      return sendText(chatId, 'Hi! HairCam is a private demo for now. Please send the passcode to start.');
    }
    session.authorized = true;
    msg = { ...msg, text: '/start' };
  }

  let input;
  if (/^\/(start|reset)\b/.test(msg.text || '')) {
    sessions.set(chatId, { ...agent.newSession(), authorized: session.authorized });
    input = { text: '[The customer just opened the chat. Greet them briefly and start the consultation.]' };
  } else if (msg.photo) {
    input = { photoId: await downloadTelegramFile(msg.photo.at(-1).file_id), text };
  } else if (msg.document?.mime_type?.startsWith('image/')) {
    input = { photoId: await downloadTelegramFile(msg.document.file_id, msg.document.mime_type), text };
  } else if (msg.location) {
    input = { location: { latitude: msg.location.latitude, longitude: msg.location.longitude } };
  } else if (text) {
    input = { text };
  } else {
    return sendText(chatId, 'I can read messages, photos and locations. 🙂');
  }

  const current = sessions.get(chatId);
  const activity = showActivity(chatId);
  const io = {
    replies: null,
    working: (tool) => activity.set(MEDIA_TOOLS.has(tool) ? 'upload_photo' : 'typing'),
    send: (item) => sendMedia(chatId, item),
    later: (item, noteText) =>
      enqueue(chatId, async () => {
        await sendMedia(chatId, item);
        agent.note(current, noteText);
        await saveSession(chatId);
      }),
  };
  try {
    const reply = await agent.turn(current, input, io);
    activity.stop();
    if (reply) await sendText(chatId, reply, io.replies);
  } catch (err) {
    activity.stop();
    console.error(`chat ${chatId}:`, err);
    await sendText(chatId, 'Sorry, something went wrong on my side. Please try again in a moment.');
  } finally {
    await saveSession(chatId);
  }
}

// --- receiving updates: webhook (deployed) or long polling (local) ---------------

// Recently seen update ids: Telegram redelivers a webhook update it thinks failed
// (e.g. during a cold start), and a turn must not run twice.
const seen = new Set();
function dispatch(update) {
  if (seen.has(update.update_id)) return;
  seen.add(update.update_id);
  if (seen.size > 1000) seen.delete(seen.values().next().value);
  if (update.message) enqueue(update.message.chat.id, () => handleMessage(update.message));
}

// Secret path and header for the webhook, derived from the bot token so they stay
// stable across restarts without another setting.
const secret = () => createHash('sha256').update(`haircam-webhook:${TOKEN()}`).digest('hex');
export const webhookPath = () => `/telegram/${secret().slice(0, 24)}`;

async function untilReady() {
  // Retry: a network blip at startup shouldn't leave the bot dead until the next deploy.
  for (let wait = 2000; ; wait = Math.min(wait * 2, 60_000)) {
    try {
      return await call('getMe');
    } catch (err) {
      console.error(`Telegram: ${err.message}; retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * Starts the bot. With a public URL (Render sets RENDER_EXTERNAL_URL; or set
 * TELEGRAM_WEBHOOK_URL) Telegram pushes updates to a webhook. Incoming requests wake
 * a sleeping free Render instance, which polling can't. Otherwise it long-polls.
 */
export async function startTelegram(app) {
  if (!TOKEN()) return;
  const base = process.env.TELEGRAM_WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL;
  if (base) {
    app.post(webhookPath(), (req, res) => {
      if (req.get('X-Telegram-Bot-Api-Secret-Token') !== secret()) return res.sendStatus(403);
      res.sendStatus(200); // answer at once; the turn runs in the background
      dispatch(req.body);
    });
    const me = await untilReady();
    await call('setWebhook', {
      url: `${base.replace(/\/$/, '')}${webhookPath()}`,
      secret_token: secret(),
      allowed_updates: ['message'],
    });
    console.log(`Telegram bot @${me.username} on webhook ${base}`);
    return;
  }

  const me = await untilReady();
  const hook = await call('getWebhookInfo');
  if (hook.url) {
    // A deployed server owns the bot. Deleting its webhook here would silently break it.
    console.error(`Telegram: @${me.username} has a webhook (${new URL(hook.url).host}), so this server won't poll. ` +
      'Set TELEGRAM_POLLING=off to hide this message, or call deleteWebhook to take the bot back.');
    return;
  }
  console.log(`Telegram bot @${me.username} polling`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        dispatch(u);
      }
    } catch (err) {
      // 409: another instance is polling the same bot, or a webhook was set meanwhile.
      console.error(err.code === 409 ? `Telegram: ${err.message}; retrying` : `Telegram: ${err.message}`);
      await new Promise((r) => setTimeout(r, err.code === 409 ? 15_000 : 3000));
    }
  }
}
