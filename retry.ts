import * as tc from "@actions/tool-cache";

export interface RetryClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const SYSTEM_CLOCK: RetryClock = {
  now: () => Date.now(),
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
};

export interface RetryOptions {
  /** How long to keep retrying, counted from the first attempt. */
  deadlineMilliseconds: number;
  firstDelayMilliseconds: number;
  maxDelayMilliseconds: number;
}

/** GitHub's release downloads fail with 5xx for minutes at a time, while some jobs of the same run still get through. */
export const DOWNLOAD_RETRY: RetryOptions = {
  deadlineMilliseconds: 60 * 60 * 1000,
  firstDelayMilliseconds: 15 * 1000,
  maxDelayMilliseconds: 5 * 60 * 1000,
};

/** A missing asset or a rejected Authorization header does not go away by asking again. */
export function isTransient(error: unknown): boolean {
  if (error instanceof tc.HTTPError) {
    const status = error.httpStatusCode ?? 0;
    return status === 408 || status === 429 || status >= 500;
  }
  return true;
}

export async function retryUntilDeadline<T>(
  attempt: () => Promise<T>,
  options: RetryOptions = DOWNLOAD_RETRY,
  clock: RetryClock = SYSTEM_CLOCK,
): Promise<T> {
  const deadline = clock.now() + options.deadlineMilliseconds;
  let delay = options.firstDelayMilliseconds;
  for (let number = 1; ; number++) {
    try {
      return await attempt();
    } catch (error) {
      const remaining = deadline - clock.now();
      if (!isTransient(error) || remaining <= 0) {
        throw error;
      }
      const wait = Math.min(delay, remaining);
      console.log(`Attempt ${number} failed (${error}), retrying in ${Math.round(wait / 1000)}s...`);
      await clock.sleep(wait);
      delay = Math.min(delay * 2, options.maxDelayMilliseconds);
    }
  }
}
