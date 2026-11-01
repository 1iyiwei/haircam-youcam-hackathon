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

1. **Reads your hair.** Take or upload a selfie (and optionally two 45° side shots). YouCam's AI detects your face shape, hair length, density, hair type (straight to coily) and frizziness. An on-screen oval guide helps you frame the photo the way the AI needs it.
2. **Checks your climate.** Enter your city and HairCam pulls the coming week's humidity and dew point to estimate your frizz risk.
3. **Recommends styles with reasons.** It ranks hairstyles by face shape, how well they work with your natural texture, humidity, density, how much daily styling you'll accept, and whether you do sports. Every style lists its pros and cons, including how many months it would take to grow back what gets cut off, and whether it needs extensions or a wig.
4. **Lets you live with it before you commit:**
   - **Try it on** your own photo.
   - **A typical day in your city:** adds the volume and curl your local humidity would cause to the try-on.
   - **Grow-out:** shows the cut at successively longer stages.
   - **See it move:** a short video of you wearing the cut, in a Calm head turn (to see the sides), Lively, Windy day or Workout motion.
5. **Connects you to the purchase.** Finds local stylists who are good with your hair type and the chosen style, and suggests shampoo, conditioner and styling products for your hair, climate and new look.

### How we built it

- **YouCam API (10 endpoints).** Detection: AI Face Analyzer, Hair Type, Hair Length, Hair Frizziness and Hair Density Detection. Generation: AI Hairstyle Generator, Hair Volume, Wavy Hair, Hair Extension, and AI Image to Video Generator V2. Hair Color, Bangs and reference-photo hairstyle transfer are wired into the backend for the next iteration.
- **Chained effects.** Every result is stored like an uploaded photo, so the humid-day, grow-out and video steps run on the try-on result rather than the original selfie.
- **Recommender.** A rule-based engine that encodes stylist knowledge about each YouCam hairstyle template (length, texture, upkeep, humidity tolerance, which face shapes it flatters), scored against the detected profile.
- **Local context.** Open-Meteo for the 7-day humidity and dew point forecast; Tavily web search for local stylists and products.
- **Stack.** Node.js and Express server (keeps API keys off the client), plain HTML/CSS/JavaScript front end with in-browser camera capture, deployed on Render.
- **Unit budgeting.** Every YouCam call is cached on disk by photo and parameters, so each result is paid for once and demos replay for free. Long video jobs run in the background while the browser polls.
- Built with Claude Code as a pair programmer.

### Challenges we ran into

- **Male and female hairstyles.** Our team includes a husband and wife, so we tested with both. YouCam's hairstyle templates are split into male and female sets, and we first chose the set from the detected gender. When face analysis couldn't read a photo, the female set (twice as large) crowded out every suggestion. We now let users choose Masculine, Feminine or All. That works reliably, and it's their choice to make.
- **Photo capture, not just upload.** Customers often don't have a suitable photo ready, and the AI needs a specific framing (face filling 50–80% of the width, near-frontal, hairline visible). We added in-browser camera capture with a face-sized oval guide and per-angle instructions.
- **Multi-angle detection.** Hair type and frizziness are designed for three photos (left 45°, front, right 45°). Our shortcut of sending one selfie three times failed the angle check, so the side shots became optional extras that unlock those two detectors.
- **Video realism.** Our first image-to-video prompt mentioned a breeze, and the hair whipped around until the hairstyle no longer matched the try-on. We tuned the prompts per motion style so the cut stays recognizable.
- **Slow video generation.** A 5-second video took about 7.5 minutes, so we moved it to a background job with polling and a visible timer.

### Accomplishments that we're proud of

- A complete flow from photo to analysis, recommendations, try-on, real-life previews, stylists and products, on a working web app.
- Recommendations that explain themselves, including a "months to grow back" cost for every cut.
- Previews of the cut after the salon: in local humidity, as it grows out, and in motion.
- A careful unit budget: caching, deduplicated in-flight calls, and remembering photo-quality errors so a bad photo isn't paid for twice.

### What we learned

- Detectors have strict photo requirements, so capture guidance matters as much as the model. A good oval guide prevents most errors.
- Dew point predicts frizz better than relative humidity alone.
- Image-to-video models follow motion words very literally; a single word like "breeze" can change the whole result.
- Chaining generative effects (try-on, then humidity, then motion) creates previews no single API call provides.

### What's next for HairCam

- Try-on from a reference photo ("this cut from Instagram, on me"), plus hair color and bangs, using endpoints already wired in the backend.
- A shareable stylist handoff card: your face wearing the chosen cut, your hair profile and notes for the stylist.
- Real booking and checkout integrations with salons and product retailers (wigs, extensions and care products).
- An AI agent that interviews you about lifestyle and budget and orchestrates the analysis and previews.
- Tracking hair density over time for people experiencing hair loss.

\* Built with
You can add up to 25 tags.

YouCam API, Perfect Corp, Claude Code, JavaScript, Node.js, Express, HTML, CSS, WebRTC, Tavily, Open-Meteo, Render

"Try it out" links
Add links where people can try your project or see your code.
URL for demo site, app store listing, GitHub repo, etc.

https://github.com/1iyiwei/haircam-youcam-hackathon

TODO: Render demo URL (passcode-protected; passcode in "Additional info")

## Project Media

Image gallery

JPG, PNG or GIF format, 5 MB max file size. For best results, use a 3:2 ratio. Up to 15 images.

Suggested shots:
1. Hair profile and climate card
2. Recommended styles with pros and cons (including "months to grow back")
3. Before and after try-on
4. Typical humid day in your city
5. Grow-out stages
6. A frame from "See it move"
7. Camera capture with the oval guide
8. Stylist and product results

\* Video demo link
This video will be embedded at the top of your project page. Read more about uploading videos.

TODO: YouTube link (1–3 minutes, public; name the YouCam APIs used and show the app running)

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

HairCam is a web app that helps people choose a haircut they will be happy living with, then connects them to the stylist and products to get it.

**Problem.** A haircut is the least reversible beauty purchase: hair grows only about 1.25 cm a month, and salon photos show a cut on its best day. People worry about how a cut will suit their face and hair texture, how it will hold up in their climate, and how much upkeep it needs, and they struggle to explain what they want to a stylist.

**Features.**
- Selfie upload or in-browser camera capture with a framing guide; optional 45° side shots.
- AI hair profile with YouCam: face shape, hair length, density, hair type and frizziness.
- Local 7-day humidity and dew point, turned into a frizz-risk estimate.
- Ranked recommendations with pros and cons, based on face shape, natural texture, humidity, density, upkeep tolerance and sports, including the months it would take to grow back.
- Try-on on the user's photo, plus previews of the try-on on a typical humid day in their city, at grow-out stages, and as a short video (Calm, Lively, Windy day or Workout).
- Local stylist search for the chosen style and hair type, and product suggestions for the user's hair, climate and new look.

**YouCam APIs used.** AI Face Analyzer, Hair Type Detection, Hair Length Detection, Hair Frizziness Detection, Hair Density Detection, AI Hairstyle Generator, Hair Volume Generator, AI Wavy Hair, AI Hair Extension, and AI Image to Video Generator V2.

**Consumer and retail value.** Consumers avoid an expensive, slow-to-undo mistake and arrive at the salon with a concrete, personalized plan. Salons get better-matched, better-prepared customers, and retailers get high-intent product recommendations (care products, wigs, extensions) tied to a measured hair profile and local climate.

**Demo access.** TODO: Render URL. Passcode: TODO (any username).

\* Provide a URL to your code repository for judging and testing.
https://github.com/1iyiwei/haircam-youcam-hackathon

\* Was there a moment during the hackathon where the API surprised you — in a good or frustrating way?

Good: how complete the hair toolkit is. Detection (type, length, frizz, density) and generation (style, volume, waves, extension, bangs, color) let us build the whole flow on one API. Because outputs are ordinary images, we could chain them: try-on, then humidity, then video. Listing the hairstyle templates costs no units, which made it easy to build a recommender on top.

Frustrating: a few requirements only surfaced at runtime. Hair type and frizz detection are designed for three real angles, and our shortcut of reusing one selfie three times failed the angle check. Image-to-video wants its resolution as a string ("480"), not a number. And the face analyzer rejected a casual selfie as "face too small". The error messages were clear enough to fix each issue quickly.

\* Are there industries or use cases you think Perfect Corp.'s API could serve that nobody is talking about yet?

- **Medical wigs and hair loss.** People facing chemotherapy or alopecia could preview wigs on themselves privately, and hair density detection could track thinning or regrowth over time for clinics and hair-restoration products.
- **Climate-aware beauty retail.** Combining hair and skin analysis with the local forecast (humidity, UV, dryness) to recommend products for this week's weather, not just for a hair or skin type.
- **Salon consultation tools.** A shared preview between client and stylist before the first cut reduces miscommunication, a common source of bad reviews and refunds for salons.

\* Where did you hit a wall technically? How did you work around it?

- **Photo quality.** Detectors rejected casual selfies (face too small, wrong angle). We added camera capture with an oval guide sized to the API's 50–80% face-width rule, cropped to portrait, and plain-language tips for each error code.
- **Three-angle detectors.** We made left and right 45° shots optional inputs that unlock hair type and frizz detection, instead of faking them with one photo.
- **Gender-dependent templates.** Inferring the style set from detected gender failed when face analysis failed, so the user now chooses the set.
- **Long video jobs.** Generation took about 7.5 minutes, too long for one HTTP request. The server now runs it as a background job, and the browser polls with a visible timer.
- **Unit budget.** We cache every result by photo and parameters, share in-flight calls, and cache photo-quality errors, so nothing is paid for twice.

Share a link to any social posts about your project.

TODO
