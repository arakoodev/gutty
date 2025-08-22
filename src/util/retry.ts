export async function withRetry<T>(fn: ()=>Promise<T>, attempts = 3, delayMs = 500): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastErr;
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>, 
  maxAttempts = 5, 
  baseDelayMs = 1000,
  maxDelayMs = 30000
): Promise<T> {
  let lastErr: any;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      
      if (attempt === maxAttempts - 1) {
        // Last attempt failed
        break;
      }
      
      // Calculate exponential backoff delay with jitter
      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
      const totalDelay = exponentialDelay + jitter;
      
      console.log(`🔄 Attempt ${attempt + 1}/${maxAttempts} failed: ${err.message || err}`);
      console.log(`⏱️ Retrying in ${Math.round(totalDelay)}ms...`);
      
      // Special handling for authentication errors - longer delays
      if (err.message?.includes('credentials') || err.message?.includes('authentication')) {
        console.log(`🔐 Authentication error detected, using extended delay...`);
        await new Promise(res => setTimeout(res, totalDelay * 2));
      } else {
        await new Promise(res => setTimeout(res, totalDelay));
      }
    }
  }
  
  throw lastErr;
}

// Rate limiter for batch operations
class RateLimiter {
  private lastCallTime = 0;
  private minInterval: number;
  
  constructor(callsPerSecond = 2) {
    this.minInterval = 1000 / callsPerSecond;
  }
  
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`🐌 Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(res => setTimeout(res, waitTime));
    }
    
    this.lastCallTime = Date.now();
  }
}

export const embeddingRateLimiter = new RateLimiter(1); // 1 call per second for embeddings
