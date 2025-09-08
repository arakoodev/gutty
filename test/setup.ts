import { vi } from 'vitest';

// Global mocks to prevent API calls in tests
vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{
                text: JSON.stringify({
                  ingredients: [
                    { name: 'Test Ingredient', confidence: 0.9, description: 'Mock ingredient' }
                  ],
                  total_ingredients: 1
                })
              }]
            }
          }]
        }
      })
    })
  }))
}));

// Mock Google Auth to prevent credential requirements
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    getClient: vi.fn().mockResolvedValue({}),
    getAccessToken: vi.fn().mockResolvedValue('mock-token')
  }))
}));

// Mock file operations for image processing
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn().mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('image')) {
          return Promise.resolve(Buffer.from('fake-image-data'));
        }
        return actual.promises.readFile(path);
      }),
      writeFile: actual.promises.writeFile,
      mkdtemp: actual.promises.mkdtemp,
      access: actual.promises.access,
      unlink: actual.promises.unlink
    }
  };
});

// Mock environment variables
process.env.VERTEX_PROJECT_ID = 'test-project';
process.env.VERTEX_LOCATION = 'us-central1';
process.env.NODE_ENV = 'test';