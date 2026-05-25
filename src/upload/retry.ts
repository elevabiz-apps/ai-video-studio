export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.log(`  Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
