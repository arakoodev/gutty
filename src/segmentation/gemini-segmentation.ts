import { VertexAI } from "@google-cloud/vertexai";
import { CFG } from "../config";
import { promises as fs } from "fs";

export interface FoodSegmentationResult {
  ingredients: {
    name: string;
    confidence: number;
    coordinates?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
  totalIngredients: number;
  processingTime: number;
}

/**
 * Gemini 2.5 Flash-based food ingredient segmentation and identification
 * Uses native image understanding without CLIP embeddings
 */
export class GeminiSegmentation {
  private client: VertexAI;
  private model: any;

  constructor() {
    this.client = new VertexAI({
      project: CFG.providers.vertex.projectId,
      location: CFG.providers.vertex.location
    });
    
    // Use Gemini 2.5 Flash for native image segmentation
    this.model = this.client.getGenerativeModel({
      model: "gemini-2.5-flash"
    });
  }

  /**
   * Segment and identify food ingredients in an image
   */
  async segmentFoodImage(imagePath: string): Promise<FoodSegmentationResult> {
    const startTime = Date.now();
    
    try {
      // Read image file
      const imageBuffer = await fs.readFile(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Very concise prompt for food ingredient segmentation
      const prompt = `List visible food ingredients as JSON:
{
  "ingredients": [{"name": "ingredient_name", "confidence": 0.9, "description": "brief description"}],
  "total_ingredients": number
}
Be specific (e.g. "red bell pepper" not "pepper").`;

      // Detect MIME type from file extension
      const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      const parts = [
        {
          text: prompt
        },
        {
          inlineData: {
            mimeType: mimeType,
            data: imageBase64
          }
        }
      ];

      const result = await this.model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,  // Low temperature for consistent results
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 8192,  // Increased token limit
        }
      });

      if (!result || !result.response) {
        throw new Error("No response from Gemini API");
      }

      const response = result.response;
      console.log("Gemini response received, checking for candidates...");
      
      // Extract text from Gemini response
      let text;
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        console.log("Candidate found:", candidate.finishReason);
        
        if (candidate.finishReason === "MAX_TOKENS") {
          console.log("Warning: Response truncated due to MAX_TOKENS, trying to extract partial content...");
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            text = candidate.content.parts[0].text;
            console.log("Partial text extracted, length:", text.length);
          }
        } else if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          text = candidate.content.parts[0].text;
          console.log("Text extracted, length:", text.length);
        } else {
          console.log("No content parts in candidate");
        }
      } else {
        console.log("No candidates in response");
        console.log("Full response:", JSON.stringify(response, null, 2));
      }

      if (!text) {
        throw new Error("No text content in Gemini response");
      }
      
      // Parse JSON response
      let parsedResponse;
      try {
        // Extract JSON from response (handle potential markdown formatting)
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        let jsonText = jsonMatch ? jsonMatch[1] : text;
        
        // If response was truncated, try to fix incomplete JSON
        if (text.includes('"MAX_TOKENS"') || !jsonText.includes('}')) {
          console.log("Attempting to fix truncated JSON response...");
          // Try to close incomplete JSON
          const openBraces = (jsonText.match(/{/g) || []).length;
          const closeBraces = (jsonText.match(/}/g) || []).length;
          if (openBraces > closeBraces) {
            jsonText += '}';
          }
        }
        
        parsedResponse = JSON.parse(jsonText);
      } catch (parseError) {
        console.warn("Failed to parse Gemini response as JSON:", text);
        // Fallback: try to extract ingredient names from text
        const ingredientMatches = text.match(/["""]([^"""]+)[""]:/g) || [];
        const fallbackIngredients = ingredientMatches.map((match, index) => ({
          name: match.replace(/["""]/g, '').replace(':', ''),
          confidence: 0.7,
          description: "extracted from text"
        }));
        
        parsedResponse = {
          ingredients: fallbackIngredients,
          total_ingredients: fallbackIngredients.length
        };
      }

      const processingTime = Date.now() - startTime;
      
      return {
        ingredients: parsedResponse.ingredients || [],
        totalIngredients: parsedResponse.total_ingredients || 0,
        processingTime
      };

    } catch (error) {
      console.error("Gemini segmentation failed:", error);
      return {
        ingredients: [],
        totalIngredients: 0,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch process multiple food images
   */
  async batchSegmentImages(imagePaths: string[]): Promise<Map<string, FoodSegmentationResult>> {
    const results = new Map<string, FoodSegmentationResult>();
    
    for (const imagePath of imagePaths) {
      console.log(`🔍 Processing ${imagePath}...`);
      try {
        const result = await this.segmentFoodImage(imagePath);
        results.set(imagePath, result);
        console.log(`✅ Found ${result.totalIngredients} ingredients in ${imagePath}`);
        
        // Rate limiting to avoid API limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to process ${imagePath}:`, error);
        results.set(imagePath, {
          ingredients: [],
          totalIngredients: 0,
          processingTime: 0
        });
      }
    }
    
    return results;
  }
}