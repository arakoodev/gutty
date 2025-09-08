import { expect, test, vi, describe, beforeEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock successful Gemini API response
const mockSuccessResponse = {
  response: {
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [{
          text: `{
            "ingredients": [
              {
                "name": "Tomato",
                "confidence": 0.95,
                "description": "Red, round fruit, sliced"
              },
              {
                "name": "Lettuce",
                "confidence": 0.9,
                "description": "Green leafy vegetable"
              }
            ],
            "total_ingredients": 2
          }`
        }]
      }
    }]
  }
};

// Mock MAX_TOKENS response
const mockMaxTokensResponse = {
  response: {
    candidates: [{
      finishReason: 'MAX_TOKENS',
      content: {
        parts: [{
          text: `{
            "ingredients": [
              {
                "name": "Tomato",
                "confidence": 0.95,
                "description": "Red, round fruit"`
        }]
      }
    }]
  }
};

// Mock truncated JSON response
const mockTruncatedResponse = {
  response: {
    candidates: [{
      finishReason: 'MAX_TOKENS',
      content: {
        parts: [{
          text: `{
            "ingredients": [
              {
                "name": "Tomato",
                "confidence": 0.95
              }
            ]
          }`
        }]
      }
    }]
  }
};

// Mock the Vertex AI model
const mockGenerateContent = vi.fn();
vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent
    })
  }))
}));

// Mock fs.readFile
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data-base64'))
    }
  };
});

import { GeminiSegmentation } from '../src/segmentation/gemini-segmentation';

describe('GeminiSegmentation', () => {
  let geminiSegmentation: GeminiSegmentation;
  
  beforeEach(() => {
    vi.clearAllMocks();
    geminiSegmentation = new GeminiSegmentation();
  });

  test('should successfully identify ingredients from image', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockSuccessResponse);
    
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0].name).toBe('Tomato');
    expect(result.ingredients[0].confidence).toBe(0.95);
    expect(result.ingredients[0].description).toBe('Red, round fruit, sliced');
    expect(result.ingredients[1].name).toBe('Lettuce');
    expect(result.totalIngredients).toBe(2);
    expect(result.processingTime).toBeGreaterThan(0);
  });

  test('should handle MAX_TOKENS response with partial content', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockMaxTokensResponse);
    
    // Should fallback to text extraction when JSON parsing fails
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    expect(result.ingredients).toBeDefined();
    expect(result.totalIngredients).toBeGreaterThanOrEqual(0);
  });

  test('should handle truncated but valid JSON response', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockTruncatedResponse);
    
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].name).toBe('Tomato');
    expect(result.totalIngredients).toBe(1); // Should be 1 for this specific test case
  });

  test('should handle empty response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { candidates: [] }
    });
    
    // Should fallback to empty ingredients when no candidates
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    expect(result.ingredients).toHaveLength(0);
    expect(result.totalIngredients).toBe(0);
  });

  test('should handle API error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API Error'));
    
    // API errors should be handled gracefully with empty result
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    expect(result.ingredients).toHaveLength(0);
    expect(result.totalIngredients).toBe(0);
  });

  test('should handle invalid JSON response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [{
              text: 'This is not JSON at all'
            }]
          }
        }]
      }
    });
    
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    
    // Should fallback to empty ingredients list
    expect(result.ingredients).toHaveLength(0);
    expect(result.totalIngredients).toBe(0);
  });

  test('should handle markdown-wrapped JSON response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [{
              text: `\`\`\`json
              {
                "ingredients": [
                  {
                    "name": "Carrot",
                    "confidence": 0.88,
                    "description": "Orange root vegetable"
                  }
                ],
                "total_ingredients": 1
              }
              \`\`\``
            }]
          }
        }]
      }
    });
    
    const result = await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    
    expect(result.ingredients).toHaveLength(1);
    expect(result.ingredients[0].name).toBe('Carrot');
    expect(result.totalIngredients).toBe(1);
  });

  test('should use correct generation config', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockSuccessResponse);
    
    await geminiSegmentation.segmentFoodImage('/fake/path/to/image.jpg');
    
    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({ text: expect.stringContaining('List visible food ingredients') }),
            expect.objectContaining({
              inlineData: expect.objectContaining({
                mimeType: 'image/jpeg',
                data: expect.any(String)
              })
            })
          ])
        })
      ]),
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 8192
      }
    });
  });

  test('should detect PNG mime type correctly', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockSuccessResponse);
    
    await geminiSegmentation.segmentFoodImage('/fake/path/to/image.png');
    
    const call = mockGenerateContent.mock.calls[0][0];
    const imageData = call.contents[0].parts.find((p: any) => p.inlineData);
    expect(imageData.inlineData.mimeType).toBe('image/png');
  });

  test('should default to JPEG mime type for unknown extensions', async () => {
    mockGenerateContent.mockResolvedValueOnce(mockSuccessResponse);
    
    await geminiSegmentation.segmentFoodImage('/fake/path/to/image.unknown');
    
    const call = mockGenerateContent.mock.calls[0][0];
    const imageData = call.contents[0].parts.find((p: any) => p.inlineData);
    expect(imageData.inlineData.mimeType).toBe('image/jpeg');
  });
});