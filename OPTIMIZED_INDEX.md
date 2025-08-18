# Optimized LanceDB Index for CLIP Filtering

This document explains how the LanceDB index has been optimized specifically for effective CLIP-based food segmentation filtering.

## Index Schema Optimizations

### **Enhanced Segment Record Structure:**
```typescript
{
  // Core identifiers
  id: "foodseg103-img_001.jpg",
  source: "foodseg103",
  
  // Food taxonomy (NEW)
  label: "tomato",
  category: "vegetable", 
  subcategory: "nightshade",
  
  // Visual quality metrics (NEW)
  image_path: "/datasets/FoodSeg103/crops/tomato/img_001.jpg",
  visual_clarity_score: 0.92,
  exemplar_rank: 1, // 1 = best exemplar for this food type
  
  // CLIP embeddings
  emb_clip_b32: [0.1, 0.2, ...], // 512-dimensional CLIP ViT-B/32
  
  // Research dataset confidence (NEW)
  dataset_confidence: 0.95,
  annotation_method: "research_dataset",
  
  // Contextual metadata (NEW)
  cooking_state: "raw",
  serving_context: "whole"
}
```

### **Key Optimizations for CLIP Filtering:**

## 1. **Food Taxonomy Hierarchy**
```typescript
const FOOD_TAXONOMY = {
  "tomato": { category: "vegetable", subcategory: "nightshade" },
  "cherry_tomato": { category: "vegetable", subcategory: "nightshade" },
  "chicken": { category: "protein", subcategory: "poultry" },
  // ... 103+ food categories from FoodSeg103
};
```

**Benefits:**
- **Semantic grouping** - similar foods cluster together
- **Hierarchical filtering** - can filter by category/subcategory  
- **Disambiguation** - distinguishes cherry tomato vs regular tomato

## 2. **Exemplar Ranking System**
```typescript
exemplar_rank: 1-N // 1 = best visual exemplar for this food type
```

**How it works:**
- Analyzes all images within each food category
- Ranks by visual clarity, file quality, filename patterns
- **Rank 1-3** = highest quality exemplars for CLIP matching
- **Boosts confidence** for top-ranked exemplars during filtering

## 3. **Visual Quality Scoring**
```typescript
visual_clarity_score: 0.0-1.0 // Higher = clearer, more representative
```

**Factors:**
- File size (larger often = clearer)
- Image analysis metrics (future: actual visual analysis)
- **CLIP filtering boost** for high-clarity images

## 4. **Research Dataset Confidence**
```typescript
dataset_confidence: 0.95 // FoodSeg103 vs 0.90 FoodInsSeg
```

**Per-dataset quality scores:**
- **FoodSeg103**: 0.95 (peer-reviewed, high-quality annotations)
- **FoodInsSeg**: 0.90 (instance segmentation focus)
- **Boosts final confidence** during CLIP filtering

## HNSW Index Optimizations

### **Food-Specific HNSW Parameters:**
```typescript
await table.createIndex("emb_clip_b32", {
  indexType: "HNSW",
  metricType: "cosine", // Best for CLIP embeddings
  M: 16,               // Bi-directional links (food similarity)
  efConstruction: 200  // Build quality (better food clustering)
});
```

**Why these parameters:**
- **Cosine similarity** optimal for normalized CLIP embeddings
- **M=16** balances recall vs speed for food images
- **efConstruction=200** ensures good clustering of similar foods

## CLIP Filtering Enhancements

### **Multi-Factor Confidence Scoring:**
```typescript
let adjustedConfidence = baseClipSimilarity;

// Boost for top exemplars  
if (exemplar_rank <= 3) adjustedConfidence *= 1.1;

// Boost for visual clarity
if (visual_clarity_score > 0.8) adjustedConfidence *= 1.05;

// Boost for research dataset quality
if (dataset_confidence > 0.9) adjustedConfidence *= 1.02;
```

**Benefits:**
- **Research dataset quality** influences final confidence
- **Visual exemplars** get priority in matching
- **High-clarity images** preferred for identification
- **Prevents false positives** from poor quality matches

### **Enhanced Filtering Pipeline:**
```typescript
// 1. Meta SAM generates all regions
const allRegions = await metaSAM(image);

// 2. CLIP embedding for each region  
const regionEmbedding = await CLIP(maskRegion);

// 3. Search optimized index (top 3 matches)
const hits = await annSearch(segments, embedding, 3);

// 4. Multi-factor confidence scoring
const bestMatch = selectBestWithQualityBoosts(hits);

// 5. Threshold filtering with enhanced confidence
if (bestMatch.adjustedConfidence >= threshold) return bestMatch;
```

## Performance Benefits

### **Before (Basic Index):**
- Simple label matching: "tomato" 
- Single CLIP similarity score
- No quality filtering
- Basic HNSW with defaults

### **After (Optimized Index):**
- **Hierarchical taxonomy:** vegetable → nightshade → tomato
- **Multi-factor confidence:** CLIP + exemplar + clarity + dataset quality
- **Quality filtering:** top exemplars preferred
- **Optimized HNSW:** food-specific parameters

## Usage

### **Create Optimized Index:**
```bash
# Automatically uses optimized indexing (default)
npx gutty seg-index

# Or explicitly
npx gutty seg-index --optimized
```

### **CLIP Filtering with Optimizations:**
```bash
# Uses optimized index automatically
npx gutty seg-extract --image food.jpg --confidence 0.8
```

### **Output with Enhanced Metadata:**
```json
{
  "file": "tomato_0.png",
  "label": "tomato",
  "confidence": 0.91,        // Multi-factor enhanced
  "similarity": 0.87,        // Raw CLIP similarity  
  "category": "vegetable",
  "subcategory": "nightshade",
  "exemplar_rank": 2,        // 2nd best tomato exemplar
  "visual_clarity_score": 0.89,
  "matchedDatasetImage": "./datasets/FoodSeg103/crops/tomato/img_002.jpg"
}
```

## Research Foundation

This optimization leverages:
- **FoodSeg103 paper** taxonomy (103 food categories)
- **CLIP paper** embedding properties (cosine similarity optimal)
- **HNSW paper** indexing parameters (food-specific tuning)
- **Food vision research** best practices for exemplar selection

The result: **Research dataset-guided CLIP filtering** that's optimized specifically for food ingredient recognition using your curated datasets.