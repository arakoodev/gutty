# @wootz/gutty (v0.4.1)

**Research-driven CLI for women's health-focused food analysis.**  
Photo → Recipe → Nutrition → Health Warnings (PCOS, IBS, Endometriosis).  
**Vertex AI Model Garden** with research dataset integration (FoodSeg103, FoodInsSeg).

## Install
```bash
npm install   # or pnpm/yarn
cp .env.example .env
```
No build needed thanks to `tsx` shebang.

## Prerequisites
- **Google Cloud Project** with Vertex AI Model Garden enabled
- **Service account JSON** with appropriate scopes
- **Environment variables**:
  ```bash
  export VERTEX_PROJECT_ID=your-project-id
  export VERTEX_LOCATION=us-central1
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
  ```

## Complete Health Analysis (NEW - Single Command)
```bash
# Analyze food image for women's health considerations
npx gutty health-analyze --image ./food-photo.jpg --verticals pcos,endometriosis,ibs
```
**Output**: Complete report with recipe identification, nutrition facts, and health warnings for PCOS/PCOD, IBS, and endometriosis.

## Dataset Setup & Indexing
```bash
# Initialize and check status
npx gutty init
npx gutty seg-status                    # Check indexing progress

# Index research datasets (FoodSeg103 + FoodInsSeg)
npx gutty seg-index                     # Auto-downloads and indexes datasets
npx gutty seg-status                    # Monitor progress (2,135 images available)

# Health knowledge base
npx gutty health-ingest --dir ./Health_KB
npx gutty health-embed  
npx gutty health-build-index
```

## Recipe Analysis Pipeline
```bash
# Setup recipe database
npx gutty ingest-recipes --dir ./Gutty_Data
npx gutty embed-recipes
npx gutty build-index

# Two-step analysis (legacy approach)  
npx gutty recipe-analyze --image food.jpg --out analysis.json
npx gutty health-annotate --recipe analysis.json --verticals pregnancy,pcos,endometriosis,ibs
```

## Research Dataset Integration  
**7,118 FoodInsSeg images** + **4 FoodSeg103 parquet files** automatically managed:

```bash
# CLIP filtering with research datasets (verified working)
npx gutty seg-extract --image food.jpg --method clip-filter --out ./masks
npx gutty seg-retrieve --masks ./masks --topk 5 --out ./segments.json
```

**Standardized paths** (robust, no manual configuration):
- `./datasets/foodinsseg/images/` - Research food images
- `./datasets/foodseg103/data/` - Parquet format datasets

## Technical Architecture

### Model Integration (Production-Tested)
- **CLIP Embeddings**: `multimodalembedding@001` (Vertex AI Model Garden)
  - 1408-dimensional vectors, CLIP-compatible
  - Both image and text embedding support
- **Vision LLM**: `gemini-1.5-flash` for recipe identification  
- **Provider**: **Vertex AI only** (fallbacks disabled for reliability)

### Health Knowledge Verticals
- **PCOS/PCOD**: Insulin resistance, refined sugar/carb flagging
- **IBS**: High-FODMAP foods (onions, garlic, wheat, etc.), trigger detection  
- **Endometriosis**: Anti-inflammatory dietary guidance
- **Pregnancy**: High-mercury fish, food safety (optional)

### USDA Nutrition Pipeline
Ingredient-specific **g/mL** from **FDC `foodPortions`** converts cups/tbsp/tsp/fl-oz/mL/L/pint/quart to grams; piece/slice handled by portion descriptors. Scales per-100g nutrients to totals.

## Monitoring & Troubleshooting

### Real-Time Status
```bash
npx gutty seg-status              # Check indexing progress, dataset status
npx gutty validate               # Verify API keys and connections
```

### Common Issues
- **Authentication**: Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to valid service account JSON
- **Missing datasets**: `seg-status` shows expected paths when datasets not found
- **Progress tracking**: All long-running operations support resumable progress
- **Vector search errors**: System uses manual similarity calculation to bypass LanceDB limitations

### Reset & Restart  
```bash
npx gutty reset                  # Remove ./lancedb and ./tmp
# Then re-run setup commands as needed
```

### Performance Notes
- **Full indexing**: 7,118 images requires hours of API processing
- **CLIP filtering**: Text→image similarity verified working (pasta/vegetable queries)
- **Incremental processing**: Skips already-processed images automatically

**Node.js**: May show `punycode` deprecation warnings from dependencies (harmless).

---

## Research Integration

Built on peer-reviewed datasets:
- **FoodSeg103**: Singapore research dataset with 103 food categories
- **FoodInsSeg**: 7,118 food images with instance segmentation 
- **Health evidence**: WHO, FDA, ACOG, Monash FODMAP research

**Women's health focus**: All verticals target dietary needs specific to women's health conditions.

MIT © 2025
