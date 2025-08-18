# Integrated Dataset-Guided Segmentation

This document explains how Gutty uses your research datasets (FoodSeg103/FoodInsSeg) to improve foundation model segmentation **without training**.

## The Problem with Generic Foundation Models

**Generic Approach (❌ Suboptimal):**
```bash
# Foundation model only knows generic concepts
seg-extract --labels "tomato,bread"  # Generic "tomato" concept
```

**Issues:**
- Foundation models are **generic** - don't leverage your domain-specific dataset
- Text prompts are **ambiguous** - "tomato" could be cherry tomato, beef tomato, etc.
- No **quality control** - segments whatever looks tomato-like
- **Disconnected** from your curated research dataset

## Integrated Approaches (✅ Better)

### **Approach 1: Dataset-Guided Exemplars**
```bash
npx gutty seg-extract --image food.jpg --method exemplars
```

**How it works:**
1. **Load your research dataset index** (FoodSeg103/FoodInsSeg)
2. **Extract representative exemplars** for each ingredient category
3. **Use dataset labels as prompts** instead of generic text
4. **SAM segments based on your domain-specific categories**

**Benefits:**
- Uses **your research dataset categories** (103 food types from FoodSeg103)
- **Domain-specific** rather than generic
- **Guided by research quality** annotations

### **Approach 2: CLIP-Filtered Region Proposals**
```bash
npx gutty seg-extract --image food.jpg --method clip-filter
```

**How it works:**
1. **Generate many candidate regions** using SAM (everything mode)
2. **Compute CLIP embedding** for each region
3. **Search your research dataset index** for most similar ingredients
4. **Filter regions** based on similarity threshold
5. **Return only high-confidence matches**

**Benefits:**
- **Exhaustive coverage** - doesn't miss ingredients
- **Quality filtered** by your research dataset
- **Confidence scores** based on dataset similarity

### **Approach 3: Hybrid (Default)**
```bash
npx gutty seg-extract --image food.jpg --method hybrid
```

**Combines both approaches:**
- Dataset exemplars for **known ingredients**
- CLIP filtering for **discovery of unexpected ingredients**
- **Best of both worlds**

## Technical Implementation

### **Zero-Shot Dataset Integration:**

```typescript
// 1. Load your research dataset (no training needed)
const segments = await getAllRows(segmentsTable); // FoodSeg103 + FoodInsSeg

// 2. Use dataset labels as SAM prompts
for (const exemplar of datasetExemplars) {
  const masks = await groundedSAM2(image, [exemplar.label]);
}

// 3. CLIP similarity for quality filtering
const embedding = await CLIP(maskRegion);
const matches = await annSearch(datasetIndex, embedding, topK);
```

### **Research Dataset as Foundation Model Guide:**

**Your FoodSeg103 Dataset provides:**
- **103 fine-grained food categories** (not generic "food")
- **Pixel-perfect segmentation examples** 
- **Research-quality annotations**
- **Domain-specific vocabulary**

**Foundation Models provide:**
- **Generalization** to new images
- **Zero-shot capability** 
- **Robust segmentation**

**Integration provides:**
- **Domain expertise** + **generalization**
- **Research quality** + **new image coverage**
- **No training required**

## Usage Examples

### **Basic Integration:**
```bash
# Uses your research dataset automatically
npx gutty seg-extract --image food.jpg
```

### **Advanced Control:**
```bash
# High-confidence only
npx gutty seg-extract --image food.jpg --confidence 0.9

# More comprehensive search  
npx gutty seg-extract --image food.jpg --max-results 50

# Just exemplar-guided (faster)
npx gutty seg-extract --image food.jpg --method exemplars
```

### **Output with Dataset Integration:**
```json
{
  "file": "tomato_0.png",
  "label": "tomato", 
  "confidence": 0.92,
  "similarity": 0.89,
  "matchedDatasetImage": "./datasets/FoodSeg103/crops/tomato/img_001.jpg",
  "method": "hybrid"
}
```

## Why This Approach is Better

**🎯 Domain-Specific:** Uses your research dataset categories, not generic concepts
**🔬 Research-Quality:** Leverages peer-reviewed segmentation datasets
**⚡ Zero-Shot:** No training required, works immediately  
**🧠 Foundation Model Power:** Generalizes to new images while staying grounded in your data
**📊 Confidence Scoring:** Quantifies how well results match your research dataset
**🔍 Integrated:** Single command instead of disconnected pipeline steps

This transforms generic foundation models into **domain-specific, research-backed segmentation tools** using your curated datasets as guidance.