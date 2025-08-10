
# AGENTS.md — gutty

This file teaches an autonomous codegen agent everything needed to take **gutty** to completion.

---

## Mission

**gutty**: local, backend‑free CLI & library that converts a **food photo** into:
1) candidate recipes via **ANN retrieval** (CLIP‑style embeddings), 
2) a consolidated **ingredient list with quantities** via a hosted **vision LLM**,
3) **USDA FoodData Central**–backed calories/macros using **density from foodPortions**.

It also runs **parallel knowledge lookups** for **PCOS/PCOD**, **endometriosis**, and **pregnancy considerations** to annotate ingredients with evidence‑based notes (informational only).

---

## Architecture

food-photo → image-embed → ANN (LanceDB/HNSW) → K candidates
            → heavy embed (re-rank) → top-N
            → VLM JSON (ingredients with qty/unit)
            → USDA FDC: search → details → density (ml↔g) → macros
            → optional health verticals (PCOS/PCOD, endometriosis, pregnancy)

**Key folders/files**
- `bin/cli.js` (Node bootstrap) → `bin/cli.ts` (Commander commands; program name = `gutty`)
- `src/providers/{vertex,replicate,fal}.ts` + `src/providers/selector.ts` (`withFallback`: Vertex → Replicate → Fal)
- `lancedb/recipes` table: `{ id, title, label, image_paths[], ingredients[], servings, emb_clip_b32[] }`
- `src/nutrition/{density.ts, usda_pipeline.ts}`
- Example dataset: `Gutty_Data/<recipeId>/{img*.jpg|png|webp, meta.json}` (≤ 5 images/recipe)

Why “≤ 5 images per recipe”: at ingest we keep up to five representative photos and **average their embeddings** to be robust to plating/angle/lighting.

---

## Providers (hosted; no training)

Priority: **Vertex → Replicate → Fal** (auto‑fallback per image).

- **Vertex**: `multimodalembedding@001` (image), `textembedding-gecko@003` (text), `gemini-1.5-flash` (vision/text JSON).
- **Replicate**: `krthr/clip-embeddings` (image/text), `lucataco/ollama-llama3.2-vision-11b` (vision JSON), `meta/meta-llama-3-70b-instruct` (text JSON).
- **Fal.ai**: JSON via `@fal-ai/client` endpoints; image uploaded with `fal.storage.upload`.

All prompts instruct: **“Return JSON only. No prose.”**

---

## Retrieval Workflow (CLI)

1. `gutty init` → create `./lancedb` & `./tmp`
2. `gutty ingest-recipes --dir ./Gutty_Data` → read up to 5 images + `meta.json` per recipe → write `recipes` table
3. `gutty embed-recipes [--restart]` → per‑image fallback; mean vector → `emb_clip_b32`; progress in `./tmp/embed.progress.json`
4. `gutty build-index` → HNSW on `emb_clip_b32`
5. `gutty recipe-retrieve --image <path>` → ANN → `./tmp/candidates.json`
6. `gutty recipe-rerank --image <path> --candidates ./tmp/candidates.json` → heavier embed/cosine → `./tmp/ranked.json`
7. `gutty recipe-rag --image <path> --candidates ./tmp/ranked.json` → VLM JSON
8. `gutty calories --recipe ./tmp/recipe.json` → FDC search/details → density → macros → `analysis.json`
9. `gutty recipe-analyze --image <path>` → end‑to‑end

**Data persistence**: LanceDB on-disk in `./lancedb`. Idempotent writes; resume by default; `gutty reset` wipes state safely.

---

## Health Verticals (knowledge annotations)

Goal: map detected ingredients to authoritative guidance (not clinical advice).

- **Pregnancy**: CDC food safety for pregnancy (avoid raw/undercooked meats/eggs, unpasteurized products; safe seafood temps), FDA fish mercury categories; ACOG nutrition/listeria FAQs; NICE NG247 (2025) pregnancy nutrition.
- **PCOS / PCOD**: NIH NICHD fact sheet; WHO fact sheet; peer‑reviewed reviews supporting weight management, insulin sensitivity, and anti‑inflammatory patterns.
- **Endometriosis**: ACOG overview; nutrition reviews suggesting potential benefit from lower fat, higher fiber, omega‑3s, and anti‑inflammatory patterns; evidence is heterogeneous.

**Mechanics**: build a small LanceDB `health_docs` with curated statements + citations; embed (Sentence‑Transformers or provider text embeddings); ANN with vertical filter → optional cross‑encoder re‑rank → per‑ingredient flags.

---

## Error Handling & Resumability

- `gutty validate` checks keys (Vertex/Replicate/Fal) and USDA key; dataset folders; file system.
- Embedding resumes by default; `--restart` re‑embeds everything.
- Per‑image provider fallback minimizes run failures.
- `gutty reset` drops `./lancedb` + `./tmp` to restart cleanly.

---

## Requirements for Codegen Agent

- Keep provider adapters thin; validate JSON from LLMs; fail closed if parse fails.
- Add optional **BLIP‑ITM re‑rank** (Replicate) behind a flag when available.
- Extend `health_docs` curation and add synonym maps for ingredient→concept (e.g., “king mackerel” → “high‑mercury fish”).
- Add unit tests for: density conversion, FDC search mapping, resume semantics, and JSON schema from VLM.

---

## Citations

**Vision-language & retrieval**
- CLIP — Radford et al., 2021. *Learning Transferable Visual Models From Natural Language Supervision*. arXiv:2103.00020.
- BLIP — Li et al., 2022. *Bootstrapping Language-Image Pre-training*. arXiv:2201.12086.
- Recipe1M / Recipe1M+ — Salvador et al., 2017; Marin et al., 2018. *Recipe1M(+): Cross‑modal embeddings for recipes & food images*.
- Sentence-BERT — Reimers & Gurevych, 2019. *Sentence-BERT*. arXiv:1908.10084.

**USDA & density**
- USDA FoodData Central — API Guide & OpenAPI; Foundation Foods documentation; FNDDS 2021–2023.
- FDA serving size guidance; general portion→gram conversion practices.

**Pregnancy**
- CDC: “Safer Food Choices for Pregnant Women” (2025).
- FDA: “Advice About Eating Fish” (2024).
- ACOG: “Nutrition During Pregnancy”; “Listeria and Pregnancy”.
- NICE NG247: *Maternal and child nutrition* (2025).

**PCOS / PCOD**
- NIH NICHD: PCOS Fact Sheet.
- WHO: PCOS Fact Sheet (2025).
- Szczuko et al., 2021: *Nutrition Strategy and Lifestyle in PCOS* (review).

**Endometriosis**
- ACOG: Endometriosis FAQ; committee opinions.
- Barnard et al., 2023: *Nutrition in the prevention and treatment of endometriosis* (review).
