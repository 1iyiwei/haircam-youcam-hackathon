# HairCam — [YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/)

[Ideation](docs/hair.md) · [Submission](docs/submission.md) · [Demo video](https://youtu.be/DO1TYv7YM1s) · [Try the bot](https://t.me/HairCamBot)

See the cut before you commit: on your face, in your city's weather, as it grows out, and in motion.

HairCam is a virtual hairstylist you chat with on Telegram ([@HairCamBot](https://t.me/HairCamBot)). It asks
about the look you want, your photo, where you live and your lifestyle, then shows recommended cuts on your
own photo and helps you find a stylist and products. The same pipeline also powers a web app.

## Run

```bash
cp .env.example .env   # fill in the keys below
npm install
npm start              # web app on http://localhost:3000, and the Telegram bot if a token is set
```

| Variable | Needed for |
|---|---|
| `YOUCAM_API_KEY` | Everything YouCam: analysis, try-ons, video |
| `TAVILY_API_KEY` | Stylist and product search |
| `OPENAI_API_KEY` | The chat stylist (`OPENAI_MODEL`, default `gpt-5.4-mini`) |
| `YOUCAM_TELEGRAM_BOT_TOKEN` | The Telegram bot (from @BotFather) |
| `TELEGRAM_POLLING=off` | Running locally while a deployed server runs the bot |
| `TELEGRAM_WEBHOOK_URL` | Optional: public base URL for webhook mode outside Render (Render's own URL is detected automatically) |
| `APP_PASSCODE` | Optional: protects a public deployment (web and bot) so strangers can't spend your YouCam units |
| `CACHE_DIR` | Optional: where results and chat sessions are stored (default `cache/`) |

Other commands:

- `npm run chat` talks to the stylist in the terminal, without Telegram: type messages, `/photo <file> [caption]`
  to send a photo, `/loc <lat>,<lon>` to share a location.
- `npm run smoke` checks templates, climate, search and the recommender, and spends no YouCam units.
  `npm run smoke -- --photo me.jpg --left l.jpg --right r.jpg --set male --try male_curtain` also runs the detectors
  and one try-on.

## The Telegram bot

An LLM plays the stylist and drives the YouCam pipeline through tools (`server/agent.js`). It asks one question at
a time, offers quick-reply buttons and a "share my location" button, and decides which tool to call next.
The Telegram adapter (`server/telegram.js`) turns messages, photos, documents and locations into agent input,
and sends back text, photos, albums and videos.

| Tool | What it does |
|---|---|
| `analyze_photos` | Face shape, hair length and density; with 45° side photos also hair type and frizz |
| `get_climate` | 7-day humidity, dew point and frizz risk, from a city or a shared location |
| `recommend_styles`, `browse_styles` | Ranked styles with reasons, or catalog search for a described look |
| `try_on`, `try_on_reference` | A template, or the hairstyle from a reference photo, on the customer's selfie |
| `try_color`, `try_bangs` | Recolor or add bangs to the current look |
| `humid_day`, `grow_out` | The current look on a typical day in their climate, and at three grow-out stages |
| `make_video` | 5 s video of the current look (calm, lively, windy, workout); sent into the chat when ready |
| `find_stylists`, `find_products` | Tavily search for local salons and products |
| `suggest_replies` | Quick-reply buttons for the next message |

Details:

- **Sessions** are kept per chat and saved under `cache/sessions/`, so a restart doesn't lose a conversation.
  `/start` or `/reset` begins a new consultation.
- **Videos** take 5–8 minutes. The bot says so, keeps chatting, and sends the video when it's ready.
- **Passcode:** with `APP_PASSCODE` set, the bot asks for it once per chat. Share the deep link
  `https://t.me/HairCamBot?start=<passcode>` to skip that step.
- **Webhook or polling:** on Render (or with `TELEGRAM_WEBHOOK_URL`) the server registers a Telegram webhook at a
  secret path, checked with a secret header and exempt from the passcode. Each message is an incoming request, so it
  also wakes a sleeping free instance. Locally it long-polls instead, so no public URL is needed.
- **One server per bot:** a bot has either a webhook or one poller. Once Render has set its webhook, a local
  server refuses to poll (it says so in the log) rather than steal the bot; set `TELEGRAM_POLLING=off` locally to
  run only the web app. To move the bot back to your machine, call Telegram's `deleteWebhook`.

## Running a demo

1. Start the server (or use the deployed one) and open [@HairCamBot](https://t.me/HairCamBot); send `/start`.
2. Use a front selfie with the face filling about half the frame width and the hairline visible. Turned 45° left
   and right photos are optional and unlock hair type and frizz detection. A synthetic face such as
   [`media/random-person.jpeg`](media/random-person.jpeg) works for public demos.
3. Share your location (or name a city), and mention lifestyle: sports, work, minutes of styling each morning.
4. Try a recommended style, then ask for a humid day, grow-out, bangs, a new color, a video, stylists or products.
5. Pre-generate any video you plan to show: results are cached, so a second request replays instantly
   and costs no units.

## Recording the demo video

`media/render.py` turns an edit list into the demo video with ffmpeg (7.1+) and Pillow:

```bash
python media/render.py media/cut-v1.json media/v1.mp4
```

The edit list names the sources, the output size and the segments (in/out times, optional crop, caption,
speed-up and masks); see the docstring in `render.py`. Silent screen recordings are fine: sources without an
audio track contribute silence. Keep the result under 3 minutes, the judging limit.

## Deploy on Render

`render.yaml` is a Render Blueprint: in Render, choose **New → Blueprint**, pick this repo, then fill in
`YOUCAM_API_KEY`, `TAVILY_API_KEY`, `OPENAI_API_KEY`, `YOUCAM_TELEGRAM_BOT_TOKEN` and `APP_PASSCODE`.
On Render the bot runs on a webhook, which works on every plan: a free instance that went to sleep after ~15
idle minutes is woken by the next Telegram message, which then waits for a cold start (roughly 30–60 s).

`render.yaml` mounts a 1 GB disk at `/var/data` for the result cache and chat sessions, which needs a paid
instance (Starter). On the free plan, remove `disk` and `CACHE_DIR`: the cache and conversations are then lost
whenever the instance restarts or sleeps, so cached results get paid for again. Render serves https, which the
browser camera needs.

## Pipeline

| Step | Source |
|---|---|
| Face shape, age, gender, hair color | YouCam `face-attr-analysis` |
| Hair type, length, frizziness, density | YouCam `hair-type-detection`, `hair-length-detection`, `hair-frizziness-detection`, `hair-density-detection` |
| Local humidity and dew point | Open-Meteo (7-day forecast; Nominatim names a shared location) |
| Ranked styles with pros, cons and months to grow back | `server/recommend.js` + `server/styles.js` |
| Try-on | YouCam `hair-style` (templates), `hair-transfer` v2.1 (reference photo), `hair-color`, `hair-bang` |
| Typical humid day | YouCam `hair-vol` → `hair-curl`, chained onto the try-on result |
| Grow-out | YouCam `hair-ext` stages chained onto the try-on result |
| Video | YouCam `image-to-video/youcam` (Image to Video V2) on the try-on result, with a prompt per motion style |
| Stylists and products | Tavily search |
| Conversation | OpenAI Chat Completions with tool calling (`server/llm.js`, `server/agent.js`) |

**Unit budget.** Every YouCam result is cached on disk by photo and parameters, so each one is paid for once.
Concurrent identical calls share one task, and photo-quality errors (face too small, wrong angle) are cached too.

**Reliability.** All external calls go through `server/net.js`, which retries brief network failures. Calls
without side effects (OpenAI, weather, search, downloads, YouCam status checks) retry on any failure; calls
that start a paid YouCam task or send a Telegram message retry only when the connection never opened, so
nothing is charged or sent twice.

## Code

| File | Role |
|---|---|
| `server/index.js` | Express server: web app, REST API, passcode, starts the bot |
| `server/telegram.js` | Telegram adapter: webhook or long polling, per-chat sessions and queues, media upload |
| `server/agent.js` | The stylist: system prompt, tools, conversation loop |
| `server/llm.js` | OpenAI client |
| `server/pipeline.js` | Analysis, try-on, chained effects, video motions |
| `server/youcam.js` | YouCam V2 client: upload, start task, poll |
| `server/recommend.js`, `server/styles.js` | Recommender and per-template stylist knowledge |
| `server/local.js` | Climate (Open-Meteo) and search (Tavily) |
| `server/cache.js`, `server/net.js`, `server/env.js` | Disk cache and photo store, retries, `.env` loading |
| `public/` | Web app: upload or camera capture, profile, recommendations, previews |
| `scripts/` | `chat.js` (terminal chat), `smoke.js` (pipeline checks) |
| `media/` | Demo video sources, edit list and `render.py` |

## Web API

| Route | Body / query |
|---|---|
| `POST /api/photos` | raw JPEG/PNG → `{ photoId, url }` |
| `POST /api/analyze` | `{ photoId, leftPhotoId?, rightPhotoId? }` → profile |
| `POST /api/recommend` | `{ profile, climate?, prefs: { city?, set?, upkeep?, active? } }` |
| `POST /api/generate` | `{ photoId, feature, params }` → `{ photoId, url }` |
| `POST /api/humid-day` | `{ photoId, profile, climate }` |
| `POST /api/grow-out` | `{ photoId }` |
| `POST /api/animate` | `{ photoId, motion? }` → 5 s, 480p video `{ photoId, url }`, or 202 `{ pending }` (poll again); motions from `GET /api/motions` |
| `GET /api/climate` | `?city=` |
| `GET /api/stylists` | `?city=&style=&hairType=` |
| `GET /api/products` | `?hairType=&frizziness=&density=&frizzRisk=&style=` |
| `GET /api/templates/:feature` | `hair-style`, `hair-curl`, `hair-vol`, `hair-ext`, `hair-bang` |
