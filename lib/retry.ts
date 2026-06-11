/* ═══════════════════════════════════════════════════════════════════════════
   Walk With Me — Retry Utility
   Exponential backoff with jitter for transient API failures.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE = [429, 500, 502, 503];
const NON_RETRYABLE = [400, 403, 404];

/**
 * Wraps an async operation with exponential backoff + jitter.
 * Only retries on transient/retryable errors.
 */
export async function fetchWithRetry(
  apiCall: () => Promise<globalThis.Response>,
  options: RetryOptions = {}
): Promise<globalThis.Response> {
  const { maxRetries = 3, baseDelay = 1000, retryableStatuses = DEFAULT_RETRYABLE } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiCall();

      // Non-retryable statuses — return immediately
      if (response.ok || NON_RETRYABLE.includes(response.status)) {
        return response;
      }

      // Retryable status but last attempt — return as-is
      if (!retryableStatuses.includes(response.status) || attempt === maxRetries) {
        return response;
      }

      // Check for Retry-After header
      const retryAfter = response.headers.get('Retry-After');
      const retryDelay = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000)
        : baseDelay * Math.pow(2, attempt);

      const jitter = Math.random() * 200;
      const delay = retryDelay + jitter;

      console.warn(
        `[Walk With Me] Attempt ${attempt + 1}/${maxRetries + 1} returned ${response.status}. ` +
        `Retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const jitter = Math.random() * 200;
      const delay = baseDelay * Math.pow(2, attempt) + jitter;

      console.warn(
        `[Walk With Me] Attempt ${attempt + 1}/${maxRetries + 1} threw: ${lastError.message}. ` +
        `Retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Should not reach here, but safety fallback
  throw lastError ?? new Error('All retry attempts exhausted');
}
