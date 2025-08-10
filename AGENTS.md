# AGENTS.md — **gutty**

A complete spec for a codegen agent to finish and maintain **gutty**: a standalone, backend‑free **CLI + npm library** that turns a **food photo** into (a) **retrieved recipes**, (b) a **structured ingredient list with amounts**, and (c) **USDA‑backed calories/macros** using density conversion. It also supports parallel **health‑knowledge annotations** for **PCOS/PCOD**, **endometriosis**, and **pregnancy** (informational use).

---

## 1) Goals & Non‑Goals

- **Hosted models only**; no custom training. Providers (priority): **Google Vertex AI → Replicate → Fal.ai** with automatic fallback per call.
- **Offline‑friendly CLI**: keys in `.env`; no server. Images are local files.
- **Reproducible pipeline**: deterministic, restartable, idempotent writes; progress files; safe resets.
- **Informational health annotations**, not diagnosis or treatment advice; use reputable sources (WHO, NIH/NICHD, ACOG, CDC, FDA, NICE).

Non‑goals: prescription, diagnosis, dietary treatment plans; collecting personal health data.

---

## 2) Data Sources (with links)

- **Recipe retrieval background**
  - CLIP (contrastive image‑text embeddings) — Radford et al., 2021. https://arxiv.org/abs/2103.00020 citeturn0search0
  - BLIP (VLP with ITM re‑ranking) — Li et al., 2022. https://arxiv.org/abs/2201.12086 citeturn0search1
  - Recipe1M+ (recipes↔image joint embeddings) — Marin et al., 2018. https://arxiv.org/abs/1810.06553 citeturn0search2
  - Sentence‑BERT (text embeddings/RAG) — Reimers & Gurevych, 2019. https://arxiv.org/abs/1908.10084 citeturn0search3

- **Nutrition & density (official)**
  - **USDA FoodData Central (FDC) API Guide**: endpoints, data types, examples — https://fdc.nal.usda.gov/api-guide citeturn1search0
  - **FDC data documentation** (Foundation, SR Legacy, Branded, FNDDS, Experimental) — https://fdc.nal.usda.gov/data-documentation citeturn1search1
  - **Foundation Foods documentation (April 2024)** — https://fdc.nal.usda.gov/Foundation_Foods_Documentation citeturn1search2
  - **OpenAPI spec** — https://fdc.nal.usda.gov/api-spec/fdc_api.html citeturn1search5

- **Pregnancy resources**
  - **CDC**: Safer food choices in pregnancy (temperatures, deli meats, unpasteurized, raw eggs) — https://www.cdc.gov/food-safety/foods/pregnant-women.html citeturn2search0
  - **FDA/EPA**: Advice about eating fish (mercury categories; 8–12 oz/wk low‑mercury) — https://www.fda.gov/food/consumers/advice-about-eating-fish citeturn2search1
  - **NICE NG247**: Maternal and child nutrition (2025) — https://www.nice.org.uk/guidance/ng247 citeturn2search4
  - **ACOG**: Nutrition during pregnancy; Listeria guidance — https://www.acog.org/womens-health/faqs/nutrition-during-pregnancy and https://www.acog.org/womens-health/faqs/listeria-and-pregnancy citeturn2search2turn2search8

- **PCOS / PCOD**
  - **WHO** PCOS fact sheet (2025) — https://www.who.int/news-room/fact-sheets/detail/polycystic-ovary-syndrome citeturn3search0
  - **NIH / NICHD** PCOS overview & factsheets — https://www.nichd.nih.gov/health/topics/factsheets/pcos citeturn3search1
  - **Review**: Szczuko et al., *Nutrients* 2021 — lifestyle/diet insights — https://pubmed.ncbi.nlm.nih.gov/34371961/ (PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC8308732/) citeturn3search2turn3search8

- **Endometriosis**
  - **ACOG** FAQ — https://www.acog.org/womens-health/faqs/endometriosis citeturn3search3
  - **Review**: Barnard et al., 2023 (*Frontiers in Nutrition*) — https://pmc.ncbi.nlm.nih.gov/articles/PMC9983692/ citeturn3search5

> These are the sources we seed in the included `Health_KB/` and cite in output annotations.

---

## 3) System Diagram (text)

```
Photo (local file)
  └─► Stage A: Image Embedding (CLIP‑style; Vertex or Replicate)
        └─► ANN prefilter (LanceDB / HNSW) → K candidates
               └─► Stage B: Re‑rank (heavier embed or ITM) → top‑N
                      └─► Vision LLM (JSON‑only) consolidates {servings, ingredients[{name, qty, unit}]}
                             └─► USDA FDC pipeline:
                                    search→details→foodPortions→density (ml↔g) → per‑100g macros scaled
                             └─► Health verticals:
                                    query builder (ingredients + synonyms) → ANN on `health_docs` → evidence
```

**Why multiple recipe images per sample (≤ 5)**: during ingest we keep up to five representative photos and average their embeddings, improving robustness to angle/lighting/plating variance.

---

## 4) Repository Layout

- `bin/cli.js` Node bootstrap (Node‑22 compatible) → runs `bin/cli.ts`
- `src/providers/{vertex,replicate,fal}.ts` — hosted adapters
- `src/providers/selector.ts` — `withFallback()` (Vertex → Replicate → Fal) per call
- `src/index/lancedb.ts` — LanceDB helpers (open/create, HNSW index, ANN)
- `src/recipes/ingest.ts` — recipe ingest (≤ 5 images per recipe; optional `meta.json`)
- `src/nutrition/{density.ts, usda_pipeline.ts}` — density calc from FDC `foodPortions`; macros
- **Health verticals**
  - `Health_KB/` — curated markdown notes with citations for **pcos**, **endometriosis**, **pregnancy**
  - `src/health/ingest.ts` — store docs to `health_docs`
  - CLI: `health-ingest`, `health-embed`, `health-build-index`, `health-query`, `health-annotate`
- Dataset example: `Gutty_Data/<recipeId>/{img*.jpg|png|webp, meta.json}`

---

## 5) Configuration

`.env.example` keys:
- **Vertex**: `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS` (abs path), models: `multimodalembedding@001`, `textembedding-gecko@003`, `gemini-1.5-flash`.
- **USDA FDC**: `FDC_API_KEY` (search/details).
- **Replicate (fallback)**: `REPLICATE_API_TOKEN`; models: `krthr/clip-embeddings`, `lucataco/ollama-llama3.2-vision-11b`, `meta/meta-llama-3-70b-instruct`.
- **Fal (optional)**: `FAL_KEY`; endpoints: `FAL_VISION_ENDPOINT`, `FAL_TEXT_ENDPOINT`.

---

## 6) CLI Commands (end‑to‑end)

```bash
# setup
pnpm i
cp .env.example .env
node bin/cli.js validate

# ingest + embed + index (recipes)
node bin/cli.js init
node bin/cli.js ingest-recipes --dir ./Gutty_Data
node bin/cli.js embed-recipes          # resumable; --restart to recompute
node bin/cli.js build-index

# retrieve + re-rank + consolidate
node bin/cli.js recipe-retrieve --image Gutty_Data/000001/img1.jpg --out tmp/candidates.json
node bin/cli.js recipe-rerank --image Gutty_Data/000001/img1.jpg --candidates tmp/candidates.json --out tmp/ranked.json
node bin/cli.js recipe-rag --image Gutty_Data/000001/img1.jpg --candidates tmp/ranked.json --out tmp/recipe.json

# USDA macros
node bin/cli.js calories --recipe tmp/recipe.json --out analysis.json

# one-shot pipeline
node bin/cli.js recipe-analyze --image Gutty_Data/000001/img1.jpg --out analysis.json

# health knowledge (pcos/endometriosis/pregnancy)
node bin/cli.js health-ingest --dir ./Health_KB
node bin/cli.js health-embed
node bin/cli.js health-build-index
node bin/cli.js health-query --vertical pregnancy --query "unpasteurized cheese, deli meat"
node bin/cli.js health-annotate --recipe tmp/recipe.json --verticals pregnancy,pcos,endometriosis --out tmp/health_annotations.json
```

---

## 7) Image Processing Flow (hosted + two‑stage retrieval)

- **Embeddings (Stage A)**  
  - Prefer **Vertex** `multimodalembedding@001`; fallback **Replicate** `krthr/clip-embeddings`.  
  - Query: embed the input photo; **ANN** over `recipes.emb_clip_b32` (cosine) returns K candidates.

- **Re‑rank (Stage B)**  
  - Compute **heavier embeddings** for query + each candidate’s rep image; cosine score → top‑N.  
  - (Optional future: **BLIP ITM** cross‑encoder as a hosted model for finer alignment, per BLIP’s ITM objective. citeturn0search1turn0search5)

- **Vision LLM consolidation**  
  - The top‑N candidates’ `(title, ingredients, servings)` are passed as **context** to a hosted vision model (Vertex Gemini or Replicate vision LLM).  
  - Prompt enforces **JSON‑only** with schema:  
    `{"chosenRecipeId": "...", "servings": number, "ingredients":[{"name": "...", "qty": number, "unit": "..."}]}`

---

## 8) USDA Pipeline (density → macros)

1. **Search** FDC (`/v1/foods/search`) for each ingredient; prefer **Foundation**, fall back to **SR Legacy/Branded**. citeturn1search0  
2. **Details** (`/v1/food/{fdcId}`) to read:
   - `foodPortions` → `measureUnit`, `amount`, `gramWeight` → derive **g/mL densities** and **per‑piece weights** (when descriptors like “slice/piece” appear). citeturn1search2
   - `foodNutrients` → energy (kcal), protein, fat, carbs (per 100 g). citeturn1search5
3. **Convert** each ingredient’s `{qty, unit}` to grams using density; scale macros per ingredient; **sum** for totals.  
4. **Output**: itemized macros + overall totals in `analysis.json`.

---

## 9) Health‑Knowledge Verticals (PCOS/PCOD, Endometriosis, Pregnancy)

**Purpose**: annotate detected ingredients with **evidence‑backed notes**. Examples:
- **Pregnancy**:
  - Highlight **high‑mercury fish** (e.g., shark, swordfish, king mackerel, tilefish, bigeye tuna, marlin, orange roughy); prefer lower‑mercury options 8–12 oz/wk. (FDA/EPA 2024) https://www.fda.gov/food/consumers/advice-about-eating-fish citeturn2search1
  - Avoid **unpasteurized** products; **raw eggs**; heat **deli meats**; cook meats to safe temperatures. (CDC 2025) https://www.cdc.gov/food-safety/foods/pregnant-women.html citeturn2search0

- **PCOS / PCOD**:
  - Emphasize dietary patterns that support **insulin sensitivity** and **weight management**; individualized approaches. (WHO 2025; NICHD; Szczuko 2021 review) https://www.who.int/news-room/fact-sheets/detail/polycystic-ovary-syndrome ; https://www.nichd.nih.gov/health/topics/factsheets/pcos ; https://pubmed.ncbi.nlm.nih.gov/34371961/ citeturn3search0turn3search1turn3search2

- **Endometriosis**:
  - Evidence suggests potential benefit from **lower fat, higher fiber**, and **omega‑3‑rich** patterns; evidence heterogenous. (ACOG; Barnard 2023 review) https://www.acog.org/womens-health/faqs/endometriosis ; https://pmc.ncbi.nlm.nih.gov/articles/PMC9983692/ citeturn3search3turn3search5

**Implementation in repo**
- Curated markdown notes with citations in `Health_KB/` (seed files present).
- `health-ingest` → `health_docs` table; `health-embed` → text embeddings; `health-build-index` → HNSW.
- `health-annotate` builds a query from detected **ingredients + synonyms/flags** and returns **top‑K evidence** per vertical. (Currently rule‑based keyword expansion; extend with synonym maps.)

---

## 10) Error Handling, Resume, and Reset

- `validate` prints explicit provider status and FDC key presence.
- Embedding resumes via `./tmp/embed.progress.json`; `--restart` recomputes all.
- LanceDB compatibility: table iteration via `table.toArray()` **or** `table.query().toArray()`.
- `reset` safely removes `./lancedb` and `./tmp` to start cleanly.
- Provider failures: **per‑image** fallback; JSON responses are parsed and validated before continuing.

---

## 11) Roadmap for Agent

- Swap re‑ranker to **BLIP‑ITM** (hosted on Replicate) guarded by `--reranker blip-itm` flag.
- Expand `Health_KB/` coverage (more foods, explicit synonym lists, structured YAML front‑matter).
- Add JSON‑Schema validation for the VLM output; auto‑repair on minor errors.
- Optional: export a **React‑Native‑Web demo** (“gutty web”) that calls the CLI library locally (keys remain local).

---

## 12) Retrospective (fixes so far)

- **Launcher errors on Node 22** → JS bootstrap that uses `--import tsx/esm` on ≥20.6; falls back to `--loader tsx` on older Nodes.
- **Permission denied / npx confusion** → clarified local usage; made `bin/cli.js` executable; updated package name and bin to **gutty**.
- **LanceDB API mismatch (`toArray`)** → table‑agnostic reader; safe fallbacks.
- **Missing provider keys** → `validate` command; clear errors; embedding requires Vertex **or** Replicate.
- **Resume & restart** → progress file + `--restart` and `reset` command.

---
