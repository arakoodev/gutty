import fs from "fs";

export function providerSummary(){
  const hasVertex = !!process.env.VERTEX_PROJECT_ID && !!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const hasFal = !!process.env.FAL_KEY; // note: Fal adapter handles JSON only by default
  return { hasVertex, hasReplicate, hasFal };
}

export function requireEmbeddingsProvider(){
  const { hasVertex, hasReplicate } = providerSummary();
  if (!hasVertex && !hasReplicate) {
    throw new Error("No embeddings provider configured. Set either Vertex (VERTEX_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS) or Replicate (REPLICATE_API_TOKEN) in your .env.");
  }
}
