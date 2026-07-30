let extractor: any = null;
let modelLoadError: Error | null = null;
let loadingPromise: Promise<any> | null = null;

/**
 * Loads the embedding model lazily with proper error handling and caching.
 * Uses 'all-MiniLM-L6-v2' (~23MB) for speed and efficiency.
 * On first call, subsequent callers wait for the same load promise.
 */
async function getExtractor() {
  if (extractor) return extractor;
  if (modelLoadError) throw modelLoadError;

  // Prevent multiple concurrent load attempts
  if (loadingPromise) return await loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log('[Embeddings] Loading transformer model lazily: all-MiniLM-L6-v2...');
      const { pipeline } = await import('@xenova/transformers');
      extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      console.log('[Embeddings] Model loaded successfully');
      return extractor;
    } catch (error) {
      modelLoadError = error as Error;
      console.error('[Embeddings] Model load failed:', modelLoadError.message);
      throw modelLoadError;
    }
  })();

  return await loadingPromise;
}

/**
 * Sanitizes input text to prevent model issues.
 */
function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .slice(0, 512) // Limit to 512 tokens (safe for all models)
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Calculates cosine similarity between two embedding vectors.
 * Both vectors should be normalized (L2 norm = 1).
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  return dotProduct; // Already normalized by Xenova's pooling option
}

/**
 * Gets embedding vector for a single text string.
 * Handles errors gracefully with fallback similarity.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const sanitized = sanitizeText(text);
    if (!sanitized) return null;

    const pipe = await getExtractor();
    const output = await pipe(sanitized, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  } catch (error) {
    console.error('[Embeddings] Failed to embed text:', error);
    return null;
  }
}

/**
 * Calculates semantic similarity between two strings (0 to 1).
 * Returns 0 on error rather than throwing.
 */
export async function getSimilarity(text1: string, text2: string): Promise<number> {
  try {
    if (!text1 || !text2) return 0;

    const pipe = await getExtractor();

    const sanitized1 = sanitizeText(text1);
    const sanitized2 = sanitizeText(text2);

    if (!sanitized1 || !sanitized2) return 0;

    // Generate embeddings with normalization
    const output1 = await pipe(sanitized1, {
      pooling: 'mean',
      normalize: true
    });
    const output2 = await pipe(sanitized2, {
      pooling: 'mean',
      normalize: true
    });

    const vec1 = Array.from(output1.data) as number[];
    const vec2 = Array.from(output2.data) as number[];

    // Cosine similarity of normalized vectors = dot product
    const similarity = cosineSimilarity(vec1, vec2);

    // Clamp to [0, 1] in case of floating point drift
    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.error('[Embeddings] Similarity calculation failed:', error);
    return 0; // Return 0 instead of throwing
  }
}

/**
 * Ranks a list of objects by their semantic similarity to a target query.
 * Filters out items where embedding fails.
 */
export async function rankBySimilarity<T>(
  items: T[],
  targetQuery: string,
  getText: (item: T) => string
): Promise<(T & { similarity: number })[]> {
  try {
    const sanitizedQuery = sanitizeText(targetQuery);
    if (!sanitizedQuery) {
      console.warn('[Embeddings] Target query is empty after sanitization');
      return items.map(item => ({ ...item, similarity: 0 }));
    }

    const results: (T & { similarity: number })[] = [];

    for (const item of items) {
      try {
        const text = getText(item);
        const similarity = await getSimilarity(sanitizedQuery, text);

        if (similarity > 0) {
          results.push({ ...item, similarity });
        }
      } catch (error) {
        console.warn('[Embeddings] Failed to rank single item:', error);
        // Skip this item rather than throwing
        continue;
      }
    }

    // Sort by similarity descending
    return results.sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('[Embeddings] Ranking failed:', error);
    return items.map(item => ({ ...item, similarity: 0 }));
  }
}

/**
 * Pre-computes embeddings for a list of texts.
 * Useful for batch processing or caching.
 */
export async function batchEmbed(
  texts: string[]
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];

  for (const text of texts) {
    try {
      const embedding = await getEmbedding(text);
      results.push(embedding);
    } catch (error) {
      console.warn('[Embeddings] Batch embed failed for item:', error);
      results.push(null);
    }
  }

  return results;
}

/**
 * Clears the cached model from memory (useful for cleanup).
 */
export function clearModelCache(): void {
  extractor = null;
  modelLoadError = null;
  loadingPromise = null;
  console.log('[Embeddings] Model cache cleared');
}