# @arakoodev/gutty (v0.3.2)

Standalone **photo → recipe retrieval → USDA-backed calories** CLI.
No backend. `.env` holds all keys. Prefers **Vertex AI**; falls back to **Replicate**, then **Fal**.

## Install
```bash
pnpm i   # or npm i / yarn
cp .env.example .env
```
No build needed to run the CLI thanks to a `tsx` shebang.

## Sample dataset included
This repo ships with **Gutty_Data/** containing two sample recipes:
- `000001` chicken pasta bowl (photo + meta.json)
- `000002` waffle (photo + meta.json)

## Quickstart
```bash
npx gutty init
npx gutty ingest-recipes --dir ./Gutty_Data
npx gutty embed-recipes
npx gutty build-index
npx gutty recipe-analyze --image Gutty_Data/000001/img1.jpg --out ./analysis.json
```

### Ingredient segmentation (zero-train)
```bash
# build region index from FoodSeg103 / FoodInsSeg crops
npx gutty seg-index --foodseg103 /path/to/FoodSeg103/crops --foodinsseg /path/to/FoodInsSeg/crops

# extract ingredient masks from a photo
npx gutty seg-extract --image sample.jpg --labels "tomato,lettuce,bread" --out ./tmp/masks

# retrieve nearest labeled ingredients for each mask
npx gutty seg-retrieve --masks ./tmp/masks --topk 5 --out ./tmp/segments.json
```

## Providers & fallbacks
Order: **Vertex → Replicate → Fal**

- **Replicate** (wired out-of-the-box):
  - CLIP-style **image/text embeddings** via `krthr/clip-embeddings` (image or text → vector).
  - **Vision LLM** via `lucataco/ollama-llama3.2-vision-11b` (image + prompt → JSON string).
  - **Text LLM** via `meta/meta-llama-3-70b-instruct`.
- **Fal.ai**: wired for **vision/text JSON** via `@fal-ai/client` (set `FAL_*_ENDPOINT`).

## USDA density
We derive ingredient-specific **g/mL** from **FDC `foodPortions`** and convert cups/tbsp/tsp/fl-oz/mL/L/pint/quart to grams; piece/slice handled by portion descriptors. Then scale per-100g nutrients to totals.

MIT © 2025


---

## Troubleshooting & Safe Resume

- **No API keys yet?** Run `npx gutty validate`. For embeddings you need **either** Vertex (service account JSON + project) **or** Replicate token.
- **`TypeError: t.toArray is not a function`** — fixed in v0.3.3 by using a table-agnostic reader.
- **Resume embedding** (default behavior): already-embedded rows are skipped, and progress persists to `./tmp/embed.progress.json`.
- **Restart from scratch**: 
  ```bash
  npx gutty reset                  # remove ./lancedb and ./tmp
  npx gutty init
  npx gutty ingest-recipes --dir ./Gutty_Data
  npx gutty embed-recipes --restart
  npx gutty build-index
  ```

**Note on warnings:** Node 22 may show a `punycode` deprecation warning from transitive deps; it’s harmless.
