# Submission
## General info

\* Project name
HairCam

\* Elevator pitch
200 characters limit

Unlike makeup or clothing, a bad haircut can take months to grow out. HairCam lets you preview weather- and lifestyle-matched hairstyles, then connects you with the right stylist and products.

## Project details
For public project page

\* About the project

### Inspiration

One of our team members often finds it difficult to manage her hair, especially in hot, humid weather, which makes it curl. She also spends a lot of time searching for haircuts suited to her hair type and the climate, along with products that meet her needs. This inspired us to build a tool that helps people make more informed hair-care choices.

Haircuts are also the least reversible beauty decision. Makeup washes off and clothes can be returned, but hair grows only about 1.25 cm a month. A salon photo shows the cut on its best day, not on a humid Tuesday or three months later, and showing a stylist a photo of someone else's hair rarely works.

### What it does

HairCam answers "will I actually like living with this cut?" before you sit in the chair.

HairCam is a virtual hairstylist you chat with on Telegram ([@HairCamBot](https://t.me/HairCamBot)). Like a good stylist, it asks what you're after, asks for a photo, where you live and how you live (work, sports, how many minutes you'll spend on your hair each morning), then shows you options and iterates with you: "shorter", "what about bangs?", "how will it look on a humid day?". The same features are also available as a web app.

1. **Reads your hair.** Send or take a selfie (and optionally two 45° side shots). YouCam's AI detects your face shape, hair length, density, hair type (straight to coily) and frizziness. The stylist coaches you on framing (the web app shows an oval guide), and relays plain-language tips if a photo can't be read.
2. **Checks your climate.** Share your location (or name a city) and HairCam pulls the coming week's humidity and dew point to estimate your frizz risk.
3. **Recommends styles with reasons.** It ranks hairstyles by face shape, how well they work with your natural texture, humidity, density, how much daily styling you'll accept, and whether you do sports. Every style lists its pros and cons, including how many months it would take to grow back what gets cut off, and whether it needs extensions or a wig.
4. **Lets you live with it before you commit:**
   - **Try it on** your own photo, or send a photo of a look you like and see that hairstyle on you.
   - **Fine-tune it:** add bangs or try a new hair color on top of the cut.
   - **A typical day in your city:** adds the volume and curl your local humidity would cause to the try-on.
   - **Grow-out:** shows the cut at successively longer stages.
   - **See it move:** a short video of you wearing the cut, in a Calm head turn (to see the sides), Lively, Windy day or Workout motion. It takes a few minutes, so the bot keeps chatting and sends the video when it's ready.
5. **Connects you to the purchase.** Finds local stylists who are good with your hair type and the chosen style, and suggests shampoo, conditioner and styling products for your hair, climate and new look.

### How we built it

- **YouCam API (13 endpoints).** Detection: AI Face Analyzer, Hair Type, Hair Length, Hair Frizziness and Hair Density Detection. Generation: AI Hairstyle Generator (templates, and v2.1 transfer from a reference photo), Hair Color, Hair Bang Generator, Hair Volume, Wavy Hair, Hair Extension, and AI Image to Video Generator V2.
- **Agentic stylist.** An LLM (OpenAI `gpt-5.4-mini`) with tool calling runs the consultation. Its 14 tools wrap the YouCam pipeline (analyze, recommend, try on, recolor, bangs, humid day, grow-out, video), the climate lookup, stylist and product search, and quick-reply buttons. It decides what to ask next and which tool to call, and explains results in plain words.
- **Telegram bot.** Long polling (no public webhook needed), one saved session per chat, quick-reply and share-location buttons, photo albums, and background video delivery.
- **Chained effects.** Every result is stored like an uploaded photo, so the humid-day, grow-out and video steps run on the try-on result rather than the original selfie.
- **Recommender.** A rule-based engine that encodes stylist knowledge about each YouCam hairstyle template (length, texture, upkeep, humidity tolerance, which face shapes it flatters), scored against the detected profile.
- **Local context.** Open-Meteo for the 7-day humidity and dew point forecast (from a city name or a shared location); Tavily web search for local stylists and products.
- **Stack.** Node.js and Express server (keeps API keys off the client) hosting both the bot and a plain HTML/CSS/JavaScript web app with in-browser camera capture; deployed on Render.
- **Unit budgeting and reliability.** Every YouCam call is cached on disk by photo and parameters, so each result is paid for once and demos replay for free. Network calls retry brief failures, but a call that starts a paid task is never sent twice.
- **Demo video.** A small Python + ffmpeg script renders the demo from a JSON edit list (segments, captions, speed-ups).
- Built with Claude Code as a pair programmer.

### Challenges we ran into

- **Male and female hairstyles.** Our team includes a husband and wife, so we tested with both. YouCam's hairstyle templates are split into male and female sets, and we first chose the set from the detected gender. When face analysis couldn't read a photo, the female set (twice as large) crowded out every suggestion. We now let users choose Masculine, Feminine or All. That works reliably, and it's their choice to make.
- **Photo capture, not just upload.** Customers often don't have a suitable photo ready, and the AI needs a specific framing (face filling 50–80% of the width, near-frontal, hairline visible). We added in-browser camera capture with a face-sized oval guide and per-angle instructions.
- **Multi-angle detection.** Hair type and frizziness are designed for three photos (left 45°, front, right 45°). Our shortcut of sending one selfie three times failed the angle check, so the side shots became optional extras that unlock those two detectors.
- **Video realism.** Our first image-to-video prompt mentioned a breeze, and the hair whipped around until the hairstyle no longer matched the try-on. We tuned the prompts per motion style so the cut stays recognizable.
- **Slow video generation.** A 5-second video took about 7.5 minutes. The web app runs it as a background job with a visible timer; in the chat it's natural: the bot says the video is coming and sends it when ready.
- **From forms to conversation.** Our first version was a website with fixed steps. Hair decisions are iterative and personal, so we rebuilt the experience as a chat with an AI stylist that asks follow-up questions, while keeping the website as a second front end on the same pipeline.
- **Flaky networks during the demo.** One connection timeout to the LLM broke a conversation. We added retries everywhere, carefully: retrying a call that starts a paid YouCam task could double-charge, so those are retried only when the connection never opened.

### Accomplishments that we're proud of

- A complete flow from photo to analysis, recommendations, try-on, real-life previews, stylists and products, as a working Telegram stylist and a web app.
- A stylist that holds a real consultation: it asks one question at a time, adapts to answers, and chains 13 YouCam endpoints on the customer's behalf.
- Recommendations that explain themselves, including a "months to grow back" cost for every cut.
- Previews of the cut after the salon: in local humidity, as it grows out, and in motion.
- A careful unit budget: caching, deduplicated in-flight calls, and remembering photo-quality errors so a bad photo isn't paid for twice.

### What we learned

- Detectors have strict photo requirements, so capture guidance matters as much as the model. A good oval guide prevents most errors.
- Dew point predicts frizz better than relative humidity alone.
- Image-to-video models follow motion words very literally; a single word like "breeze" can change the whole result.
- Chaining generative effects (try-on, then humidity, then motion) creates previews no single API call provides.
- A website isn't really the best medium for a virtual hair assistant, so we switched to a chatbot later which works much more naturally in an iterative conversation style.

### What's next for HairCam

- A shareable stylist handoff card: your face wearing the chosen cut, your hair profile and notes for the stylist.
- Real booking and checkout integrations with salons and product retailers (wigs, extensions and care products).
- WhatsApp and LINE versions of the stylist, which plug into the same agent.
- Voice messages, and remembering a customer between visits to track how their hair and preferences change.
- Tracking hair density over time for people experiencing hair loss.

\* Built with
You can add up to 25 tags.

YouCam API, Perfect Corp, Claude Code, OpenAI, Telegram Bot API, JavaScript, Node.js, Express, HTML, CSS, WebRTC, Tavily, Open-Meteo, Render, Python, FFmpeg

"Try it out" links
Add links where people can try your project or see your code.
URL for demo site, app store listing, GitHub repo, etc.

https://t.me/HairCamBot

<!--
https://haircam-youcam-hackathon.onrender.com/

TODO: Render demo URL (passcode-protected; passcode in "Additional info")
-->

## Project Media

Image gallery

JPG, PNG or GIF format, 5 MB max file size. For best results, use a 3:2 ratio. Up to 15 images.

Suggested shots:
1. Chat opening: the stylist's first question with quick-reply buttons
2. Photo coaching and the hair profile reply
3. Recommendations with reasons (including "months to grow back")
4. Before and after try-on in the chat
5. Typical humid day in your city
6. Grow-out album
7. A frame from the video
8. Stylist and product results
9. The web app: recommendations grid and camera capture with the oval guide

\* Video demo link
This video will be embedded at the top of your project page. Read more about uploading videos.

https://youtu.be/DO1TYv7YM1s

# Additional info

For judges and organizers

Unless noted, additional info is for judges and hackathon organizers and will not appear on your public project page.

* * *

Upload a File

Upload a file as part of your submission - e.g., zip, pdf, word, apk, etc. To upload multiple files, put them in a zip file and upload the zip file. Limit: 35 MB.

Sponsor / Special Prizes

-   Sponsor / Special Prizes
Women in Tech Special Award

\* Submitter type

Team of individual

\* What is your country of residence?
United states

\* App Status
New

\* Provide a text description explaining the features, functionality, and consumer or retail value of your project.

HairCam is a virtual hairstylist on Telegram (with a companion web app) that helps people choose a haircut they will be happy living with, then connects them to the stylist and products to get it.

**Problem.** A haircut is the least reversible beauty purchase: hair grows only about 1.25 cm a month, and salon photos show a cut on its best day. People worry about how a cut will suit their face and hair texture, how it will hold up in their climate, and how much upkeep it needs, and they struggle to explain what they want to a stylist.

**Features.**
- A conversational consultation: an AI stylist asks about the look you want, your photo, location and lifestyle, and iterates with you.
- Selfie in the chat (or upload or camera capture with a framing guide on the web); optional 45° side shots.
- AI hair profile with YouCam: face shape, hair length, density, hair type and frizziness.
- Local 7-day humidity and dew point, turned into a frizz-risk estimate.
- Ranked recommendations with pros and cons, based on face shape, natural texture, humidity, density, upkeep tolerance and sports, including the months it would take to grow back.
- Try-on on the user's photo (from a recommended style or the user's own reference photo), with bangs and hair color on top, plus previews of the try-on on a typical humid day in their city, at grow-out stages, and as a short video (Calm, Lively, Windy day or Workout).
- Local stylist search for the chosen style and hair type, and product suggestions for the user's hair, climate and new look.

**YouCam APIs used.** AI Face Analyzer, Hair Type Detection, Hair Length Detection, Hair Frizziness Detection, Hair Density Detection, AI Hairstyle Generator (templates and reference-photo transfer), AI Hair Color, AI Hair Bang Generator, Hair Volume Generator, AI Wavy Hair, AI Hair Extension, and AI Image to Video Generator V2.

**Agentic workflow.** An LLM stylist with 14 tools decides which YouCam calls to make and chains them: analysis feeds the recommender, the try-on result feeds the humidity, grow-out, color, bangs and video steps.

**Consumer and retail value.** Consumers avoid an expensive, slow-to-undo mistake and arrive at the salon with a concrete, personalized plan. Salons get better-matched, better-prepared customers, and retailers get high-intent product recommendations (care products, wigs, extensions) tied to a measured hair profile and local climate.

**How to try it.**
1. Open https://t.me/HairCamBot in Telegram and send /start.
2. Send a front selfie: face the camera, face filling about half the frame width, hairline visible. You can use a synthetic face such as https://github.com/1iyiwei/haircam-youcam-hackathon/blob/main/media/random-person.jpeg. Optionally add photos turned 45° left and right to unlock hair type and frizz detection.
3. Share your location (or name a city) and tell the stylist about your routine, e.g. "I go to the gym and have 10 minutes in the morning".
4. Pick a suggested style, then try: "show me on a humid day", "how does it grow out?", "add bangs", "try copper red", "make a calm video" (arrives in 5–8 minutes), "find stylists near me", "what products should I use?". Send /reset to start over.

The demo video shows a full consultation. To run HairCam yourself, see the README in the repository.

\* Provide a URL to your code repository for judging and testing.
https://github.com/1iyiwei/haircam-youcam-hackathon

\* Was there a moment during the hackathon where the API surprised you — in a good or frustrating way?

Good: how complete the hair toolkit is. Detection (type, length, frizz, density) and generation (style, volume, waves, extension, bangs, color) let us build the whole flow on one API. Because outputs are ordinary images, we could chain them: try-on, then humidity, then bangs or color, then video. That made the API a natural fit for an AI agent with tools. Listing the hairstyle templates costs no units, which made it easy to build a recommender on top.

Frustrating: a few requirements only surfaced at runtime. Hair type and frizz detection are designed for three real angles, and our shortcut of reusing one selfie three times failed the angle check. Image-to-video wants its resolution as a string ("480"), not a number. And the face analyzer rejected a casual selfie as "face too small". The error messages were clear enough to fix each issue quickly.

\* Are there industries or use cases you think Perfect Corp.'s API could serve that nobody is talking about yet?

- **Medical wigs and hair loss.** People facing chemotherapy or alopecia could preview wigs on themselves privately, and hair density detection could track thinning or regrowth over time for clinics and hair-restoration products.
- **Climate-aware beauty retail.** Combining hair and skin analysis with the local forecast (humidity, UV, dryness) to recommend products for this week's weather, not just for a hair or skin type.
- **Salon consultation tools.** A shared preview between client and stylist before the first cut reduces miscommunication, a common source of bad reviews and refunds for salons.

\* Where did you hit a wall technically? How did you work around it?

- **Photo quality.** Detectors rejected casual selfies (face too small, wrong angle). We added camera capture with an oval guide sized to the API's 50–80% face-width rule, cropped to portrait, and plain-language tips for each error code.
- **Three-angle detectors.** We made left and right 45° shots optional inputs that unlock hair type and frizz detection, instead of faking them with one photo.
- **Gender-dependent templates.** Inferring the style set from detected gender failed when face analysis failed, so the user now chooses the set.
- **Long video jobs.** Generation took about 7.5 minutes, too long for one HTTP request. The web server runs it as a background job that the browser polls; the chatbot sends the video into the conversation when it's ready.
- **Tool calling and model settings.** Our LLM rejected tool calls combined with reasoning settings on the endpoint we used, so we run the stylist without extended reasoning, which also keeps replies fast (about a second per step).
- **Network flakiness.** A single LLM timeout broke a live conversation. All external calls now retry brief failures, while calls that start paid YouCam tasks are retried only when the connection never opened, so nothing is charged twice.
- **Unit budget.** We cache every result by photo and parameters, share in-flight calls, and cache photo-quality errors, so nothing is paid for twice.

Share a link to any social posts about your project.

TODO
