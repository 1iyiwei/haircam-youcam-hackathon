// Chat with the HairCam stylist in the terminal, without Telegram.
//   npm run chat
// Lines are messages; "/photo <file or photoId> [caption]" sends a photo,
// "/loc <lat>,<lon>" shares a location. Media the bot sends are printed as local URLs.
import '../server/env.js';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import * as agent from '../server/agent.js';
import { savePhoto } from '../server/cache.js';

const session = agent.newSession();
const url = (id) => `http://localhost:${process.env.PORT || 3000}/api/photos/${id}`;
const io = {
  send: async (item) => console.log(`  [${item.type}] ${item.caption || ''} ${(item.photoIds || [item.photoId]).map(url).join(' ')}`),
  later: (item, note) => {
    console.log(`\n  [later ${item.type}] ${item.caption || item.text || ''} ${item.photoId ? url(item.photoId) : ''}`);
    agent.note(session, note);
  },
};

async function inputFor(line) {
  const [cmd, arg, ...rest] = line.split(' ');
  if (cmd === '/photo') {
    const photoId = /^[0-9a-f]{24}$/.test(arg) ? arg : await savePhoto(await readFile(arg), 'image/jpeg');
    return { photoId, text: rest.join(' ') };
  }
  if (cmd === '/loc') {
    const [latitude, longitude] = arg.split(',').map(Number);
    return { location: { latitude, longitude } };
  }
  return { text: line };
}

const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const say = async (input) => {
  io.replies = null;
  const reply = await agent.turn(session, input, io);
  console.log(`HairCam: ${reply}`);
  if (io.replies) console.log(`  [buttons] ${io.replies.options.join(' | ')}${io.replies.askLocation ? ' | 📍 location' : ''}`);
};

await say({ text: '[The customer just opened the chat. Greet them briefly and start the consultation.]' });
for await (const line of lines) {
  if (!line.trim()) continue;
  console.log(`> ${line}`);
  await say(await inputFor(line.trim()));
}
