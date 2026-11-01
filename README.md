# HairCam — [YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/)

[Ideation](docs/hair.md)

See the cut before you commit: on your face, in your city's weather, and as it grows out.

## Run

```bash
cp .env.example .env   # fill in YOUCAM_API_KEY and TAVILY_API_KEY
npm install
npm start              # http://localhost:3000
```

`npm run smoke` checks templates, climate, search and the recommender, and spends no YouCam units.
`npm run smoke -- --photo me.jpg --try female_curly_bob` also runs the detectors and one try-on.

## Pipeline

| Step | Source |
|---|---|
| Face shape, age, gender, hair color | YouCam `face-attr-analysis` |
| Hair type, length, frizziness, density | YouCam `hair-type-detection`, `hair-length-detection`, `hair-frizziness-detection`, `hair-density-detection` |
| Local humidity and dew point | Open-Meteo (7-day forecast) |
| Ranked styles with pros, cons and months to grow back | `server/recommend.js` + `server/styles.js` |
| Try-on | YouCam `hair-style` (templates), `hair-transfer` v2.1 (reference photo), `hair-color`, `hair-bang` |
| Typical humid day | YouCam `hair-vol` → `hair-curl`, chained onto the try-on result |
| Grow-out | YouCam `hair-ext` stages chained onto the try-on result |
| Turn-your-head video | YouCam `image-to-video/youcam` (Image to Video V2) on the try-on result |
| Stylists and products | Tavily search |

All YouCam results are cached under `cache/` by photo and parameters, so each one is paid for once.

## API

| Route | Body / query |
|---|---|
| `POST /api/photos` | raw JPEG/PNG → `{ photoId, url }` |
| `POST /api/analyze` | `{ photoId, leftPhotoId?, rightPhotoId? }` → profile |
| `POST /api/recommend` | `{ profile, climate?, prefs: { city?, set?, upkeep?, active? } }` |
| `POST /api/generate` | `{ photoId, feature, params }` → `{ photoId, url }` |
| `POST /api/humid-day` | `{ photoId, profile, climate }` |
| `POST /api/grow-out` | `{ photoId }` |
| `POST /api/animate` | `{ photoId }` → 5 s, 480p video `{ photoId, url }` |
| `GET /api/climate` | `?city=` |
| `GET /api/stylists` | `?city=&style=&hairType=` |
| `GET /api/products` | `?hairType=&frizziness=&density=&frizzRisk=` |
| `GET /api/templates/:feature` | `hair-style`, `hair-curl`, `hair-vol`, `hair-ext`, `hair-bang` |
