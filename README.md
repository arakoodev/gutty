# @wootz/gutty (v0.5.0)

**Research-driven CLI for women's health-focused food analysis.**  
Photo → Ingredient Identification → Nutrition → Health Warnings (PCOS, IBS, Endometriosis).  
**Gemini 2.5 Flash** direct ingredient identification with COFID nutrition database integration.

## Quick Start

### 1. Installation
```bash
git clone <repo>
cd gutty
npm install
cp .env.example .env
```

### 2. Google Cloud Setup
```bash
# Set required environment variables
export VERTEX_PROJECT_ID=your-project-id
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 3. Build Required Databases (One-time setup)
```bash
# Build nutrition databases (required for health analysis)
npx gutty nutrition-index     # COFID nutrition data (~3,000 foods)
npx gutty gi-index           # Glycemic index database (~2,000 foods)  
npx gutty fodmap-index       # FODMAP classifications (~500 foods)
```

### 4. Run Analysis
```bash
# Analyze food image for health considerations
npx gutty gemini-health-analyze --image ./food-photo.jpg --verticals pcos,endometriosis,ibs --out analysis.json
```

That's it! The system is ready to use.

## Complete Setup Guide

### Prerequisites

**Required:**
- Node.js 18+
- Google Cloud Project with Vertex AI API enabled
- Service account JSON with Vertex AI permissions

**Google Cloud Setup:**
1. Create Google Cloud Project
2. Enable Vertex AI API
3. Create service account with `Vertex AI User` role
4. Download service account JSON file
5. Set environment variables:
   ```bash
   export VERTEX_PROJECT_ID=your-project-id
   export VERTEX_LOCATION=us-central1  # or your preferred region
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

### Database Indexing (Required)

The system needs three LanceDB tables for nutrition analysis:

```bash
# 1. COFID Nutrition Database (~3,000 UK foods)
npx gutty nutrition-index
# Creates: ./lancedb/nutrition_data table
# Contains: calories, protein, carbs, fat, fiber, sodium per 100g

# 2. Glycemic Index Database (~2,000 foods) 
npx gutty gi-index
# Creates: ./lancedb/glycemic_index table
# Contains: GI values, glycemic load, categories

# 3. FODMAP Classification Database (~500 foods)
npx gutty fodmap-index  
# Creates: ./lancedb/fodmap_data table
# Contains: FODMAP levels, serving sizes, trigger classifications
```

**Expected Output:**
```
✓ Nutrition database indexed: 2847 foods
✓ Glycemic index database indexed: 1876 foods  
✓ FODMAP database indexed: 492 foods
```

### Verify Setup
```bash
# Check database status and API connections
npx gutty validate

# Check LanceDB tables
ls ./lancedb/
# Should show: nutrition_data.lance, glycemic_index.lance, fodmap_data.lance
```

## Usage

### Primary Command (Production Ready)
```bash
# Complete health analysis pipeline
npx gutty gemini-health-analyze \
  --image ./food-photo.jpg \
  --verticals pcos,endometriosis,ibs \
  --out health-analysis.json
```

**Parameters:**
- `--image`: Path to food image (JPG/PNG) or URL
- `--verticals`: Health conditions to analyze (comma-separated)
  - Available: `pcos`, `endometriosis`, `ibs`, `pregnancy`
- `--out`: Output JSON file path (optional, defaults to `./gemini-health-analysis.json`)

### Processing Pipeline

**Step 1: Ingredient Identification**
- Gemini 2.5 Flash analyzes image
- Identifies individual food ingredients
- Provides confidence scores and descriptions
- ~15-20 seconds processing time

**Step 2: Nutrition Mapping**
- Maps ingredients to COFID nutrition database
- Calculates nutrition totals (calories, macros, GI)
- Determines FODMAP classifications
- ~5 seconds database lookup

**Step 3: Health Analysis**
- Rule-based health analysis for selected verticals
- Generates warnings and recommendations
- Cites clinical evidence sources
- Instant rule evaluation

### Output Format

Complete structured JSON report:

```json
{
  "metadata": {
    "analysis_date": "2025-09-08T13:24:35.387Z",
    "input_image": "/path/to/image.jpg",
    "verticals_analyzed": ["pcos", "endometriosis", "ibs"],
    "processing_pipeline": "Image → Gemini 2.5 Flash Ingredient ID → Nutrition Mapping → Health Analysis"
  },
  "step1_ingredient_identification": {
    "method": "gemini-2.5-flash",
    "ingredients_found": 4,
    "identified_ingredients": [
      {
        "name": "Okra",
        "confidence": 0.9,
        "description": "Elongated, green, cooked vegetable pieces visible in curry"
      }
    ]
  },
  "step2_nutrition_mapping": {
    "ingredient_mapping": [
      {
        "ingredient": "Okra",
        "cofid_match": "Okra, boiled in unsalted water",
        "glycemic_index": 54,
        "nutrition_per_100g": {
          "calories": 16,
          "protein_g": 1.8,
          "carbs_g": 1.9,
          "fat_g": 0.2,
          "fiber_g": 3.1,
          "sodium_mg": 5
        },
        "health_flags": ["low-gi", "pcos-friendly", "low-fodmap", "ibs-friendly"]
      }
    ],
    "totals_calculated": {
      "calories": 131,
      "gi_value": 54,
      "is_low_gi": true,
      "is_high_fodmap": false
    },
    "database_coverage": {
      "coverage_percentage": 85
    }
  },
  "step3_health_analysis": {
    "analysis_by_vertical": {
      "pcos": {
        "triggers_found": [
          {
            "message": "Low glycemic index (54) supports insulin sensitivity",
            "severity": "positive",
            "recommendation": "Good choice for PCOS management"
          }
        ]
      },
      "ibs": {
        "triggers_found": [
          {
            "message": "Low-FODMAP ingredients are generally well-tolerated",
            "severity": "positive",
            "recommendation": "Good choice for IBS management"
          }
        ]
      }
    }
  },
  "final_results": {
    "summary": {
      "ingredients_count": 4,
      "nutrition_matches": 3,
      "health_flags": 2,
      "processing_success": true
    }
  }
}
```

## Health Analysis Verticals

### PCOS/PCOD
**Analysis Focus:**
- Glycemic index evaluation (Low ≤55, High ≥70)
- Insulin sensitivity impact
- Refined carbohydrate content
- Fiber content benefits

**Evidence Base:**
- WHO diabetes prevention guidelines
- NICHD PCOS research recommendations
- Clinical nutrition studies on insulin resistance

### IBS (Irritable Bowel Syndrome)  
**Analysis Focus:**
- FODMAP classification (High/Medium/Low)
- Common trigger foods identification
- Fiber content evaluation
- Serving size considerations

**Evidence Base:**
- Monash University FODMAP research
- ACG IBS management guidelines
- Low-FODMAP diet clinical trials

### Endometriosis
**Analysis Focus:**
- Anti-inflammatory potential
- Fiber content benefits
- Omega-3 fatty acid presence
- Processed food identification

**Evidence Base:**
- ACOG endometriosis management
- Anti-inflammatory diet research
- Women's health nutrition studies

## Troubleshooting

### Common Issues

**Authentication Errors:**
```bash
# Verify environment variables
echo $VERTEX_PROJECT_ID
echo $VERTEX_LOCATION  
echo $GOOGLE_APPLICATION_CREDENTIALS

# Test API access
npx gutty validate
```

**Database Issues:**
```bash
# Rebuild databases if corrupted
npx gutty reset  # Removes ./lancedb directory
npx gutty nutrition-index
npx gutty gi-index  
npx gutty fodmap-index
```

**Gemini API Errors:**
- `MAX_TOKENS`: Automatically handled with response parsing
- `API_QUOTA_EXCEEDED`: Wait and retry, or increase quota
- `PERMISSION_DENIED`: Check service account permissions

**Missing Nutrition Matches:**
- Expected: 85%+ ingredient matching rate
- Unmatched ingredients logged with warnings
- Does not prevent analysis completion

### Performance Optimization

**Processing Speed:**
- Average: ~25 seconds per image
- Network dependent (API calls to Vertex AI)
- Database lookups are near-instant (local LanceDB)

**Batch Processing:**
```bash
# Process multiple images
for img in *.jpg; do
  npx gutty gemini-health-analyze --image "$img" --verticals pcos,ibs --out "${img%.jpg}-analysis.json"
done
```

## Data Sources & Evidence

### Nutrition Data
- **COFID**: UK Composition of Foods Integrated Dataset (government standard)
- **Glycemic Index**: University of Sydney GI research database
- **FODMAP**: Monash University clinical research classifications

### Health Guidelines
- **WHO**: World Health Organization nutrition guidelines
- **FDA**: US Food and Drug Administration safety standards
- **ACOG**: American College of Obstetricians and Gynecologists
- **NICHD**: National Institute of Child Health and Human Development

### Clinical Evidence
All health recommendations cite peer-reviewed research and established clinical guidelines. No AI interpretation - purely rule-based analysis using evidence-based thresholds.

## Advanced Features (Optional)

### Legacy CLIP Pipeline
```bash
# Recipe-based analysis (slower but available)
npx gutty health-analyze --image food.jpg --verticals pcos,ibs
```

### Research Dataset Integration
```bash
# Optional: Food segmentation datasets
npx gutty seg-index      # Downloads FoodSeg103 + FoodInsSeg
npx gutty seg-status     # Monitor dataset status
```

### Custom Analysis
```bash
# Individual pipeline components
npx gutty gemini-analyze --image food.jpg           # Ingredient ID only
npx gutty nutrition-match --ingredients "okra,rice" # Nutrition lookup only
```

## System Requirements

**Minimum:**
- Node.js 18+
- 4GB RAM 
- 2GB disk space (for databases)
- Internet connection (for API calls)

**Recommended:**
- Node.js 20+
- 8GB RAM
- SSD storage
- High-speed internet

**Network Usage:**
- ~2MB per image (Gemini API calls)
- Database operations are local (no network)

---

## License

MIT © 2025 - Research-driven women's health nutrition analysis