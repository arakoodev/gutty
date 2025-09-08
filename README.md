# Gutty - AI Food Health Analysis

**Direct ingredient identification and women's health analysis from food photos.**

Takes a food image → identifies ingredients → provides health recommendations for PCOS, IBS, and Endometriosis.

## Quick Start

```bash
# 1. Install
npm install
cp .env.example .env

# 2. Set Google Cloud credentials
export VERTEX_PROJECT_ID=your-project-id
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# 3. Build nutrition databases (one-time, ~30 seconds)
npx gutty nutrition-index
npx gutty gi-index  
npx gutty fodmap-index

# 4. Analyze food image
npx gutty gemini-health-analyze --image food.jpg --verticals pcos,ibs,endometriosis --out analysis.json
```

## How It Works

**Step 1**: Gemini 2.5 Flash analyzes your food image and identifies individual ingredients
**Step 2**: Ingredients are matched to nutrition database (COFID) for calories, macros, GI values
**Step 3**: Rule-based health analysis generates warnings/recommendations for selected conditions

**Total time**: ~25 seconds per image

## Prerequisites

1. **Node.js 18+**
2. **Google Cloud Project** with Vertex AI API enabled  
3. **Service account** with Vertex AI permissions + JSON key file

### Google Cloud Setup
```bash
# Create project, enable Vertex AI API, create service account with "Vertex AI User" role
# Download service account JSON, then:
export VERTEX_PROJECT_ID=your-project-id
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account.json
```

## Database Setup (Required)

The system needs 3 local nutrition databases. Run once:

```bash
npx gutty nutrition-index     # UK COFID nutrition data (3,000 foods)
npx gutty gi-index           # Glycemic index values (2,000 foods)  
npx gutty fodmap-index       # FODMAP classifications (500 foods)
```

**Expected output:**
```
✓ Indexed 2847 nutrition records
✓ Indexed 1876 glycemic index records  
✓ Indexed 492 FODMAP records
```

**Verify setup:**
```bash
npx gutty validate           # Check API access and databases
ls ./lancedb/               # Should show: nutrition_data.lance, glycemic_index.lance, fodmap_data.lance
```

## Usage

### Main Command
```bash
npx gutty gemini-health-analyze --image PHOTO --verticals CONDITIONS --out OUTPUT.json
```

**Parameters:**
- `--image`: Path to food photo (JPG/PNG) or image URL
- `--verticals`: Health conditions to analyze (comma-separated): `pcos`, `ibs`, `endometriosis`  
- `--out`: Output JSON file path (optional)

### Example
```bash
npx gutty gemini-health-analyze --image curry.jpg --verticals pcos,ibs --out curry-analysis.json
```

## Output Format

Complete structured JSON report:

```json
{
  "step1_ingredient_identification": {
    "method": "gemini-2.5-flash",
    "identified_ingredients": [
      {"name": "Okra", "confidence": 0.9, "description": "Green cooked vegetable pieces"}
    ]
  },
  "step2_nutrition_mapping": {
    "ingredient_mapping": [
      {
        "ingredient": "Okra",
        "cofid_match": "Okra, boiled in unsalted water", 
        "glycemic_index": 54,
        "nutrition_per_100g": {"calories": 16, "protein_g": 1.8, "carbs_g": 1.9},
        "health_flags": ["low-gi", "pcos-friendly", "low-fodmap"]
      }
    ],
    "totals_calculated": {"calories": 131, "gi_value": 54, "is_low_gi": true}
  },
  "step3_health_analysis": {
    "analysis_by_vertical": {
      "pcos": {
        "triggers_found": [
          {"message": "Low GI (54) supports insulin sensitivity", "severity": "positive"}
        ]
      },
      "ibs": {
        "triggers_found": [
          {"message": "Low-FODMAP ingredients well-tolerated", "severity": "positive"}
        ]
      }
    }
  }
}
```

## Health Analysis

### PCOS/PCOD
- **Analyzes**: Glycemic index impact on insulin sensitivity
- **Flags**: High GI foods (>70), refined carbs, low fiber
- **Recommends**: Low GI alternatives, high fiber foods

### IBS (Irritable Bowel Syndrome)  
- **Analyzes**: FODMAP content based on Monash University research
- **Flags**: High FODMAP triggers (onions, garlic, wheat, certain fruits)
- **Recommends**: Low FODMAP alternatives, portion guidance

### Endometriosis
- **Analyzes**: Anti-inflammatory potential, fiber content
- **Flags**: Processed foods, low fiber meals
- **Recommends**: Anti-inflammatory foods, fiber-rich options

## Troubleshooting

### Authentication Issues
```bash
# Check environment variables
echo $VERTEX_PROJECT_ID
echo $GOOGLE_APPLICATION_CREDENTIALS

# Test API access  
npx gutty validate
```

### Database Issues
```bash
# Rebuild if corrupted
rm -rf ./lancedb/
npx gutty nutrition-index && npx gutty gi-index && npx gutty fodmap-index
```

### Common Errors
- **"No text content in Gemini response"**: API quota exceeded or network issue
- **"No nutrition match found"**: Normal for ~15% of ingredients, analysis continues
- **"Permission denied"**: Check service account has Vertex AI User role

## Performance

- **Processing time**: ~25 seconds per image
- **Nutrition matching**: ~85% ingredient coverage
- **Database size**: ~50MB total (local LanceDB files)
- **Network usage**: ~2MB per image (Gemini API only)

## Data Sources

- **Nutrition**: UK COFID database (government nutrition standards)
- **Glycemic Index**: University of Sydney research database  
- **FODMAP**: Monash University clinical research
- **Health guidelines**: WHO, ACOG, NICHD peer-reviewed recommendations

All health recommendations are rule-based using evidence-based thresholds. No AI interpretation of results.

## System Requirements

- **Minimum**: Node.js 18+, 2GB RAM, 1GB disk, internet connection
- **Recommended**: Node.js 20+, 4GB RAM, SSD storage

---

MIT © 2025