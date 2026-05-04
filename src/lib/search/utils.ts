import {
  logRequestEvent,
  RequestLogContext,
  serializeError,
} from '@/lib/observability/request';
import { delay } from '@/lib/utils/async';
import { SearchError, SearchResult } from './types';

type FetchJsonOptions = {
  backend: string;
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
};

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const isAbortError = (err: unknown) =>
  err instanceof Error && err.name === 'AbortError';

export const toSearchError = (
  backend: string,
  err: unknown,
  status?: number,
): SearchError => {
  const serialized = serializeError(err);

  return {
    backend,
    message: serialized.message,
    status,
    retryable: status ? isRetryableStatus(status) : true,
  };
};

export const emptySearchResult = (
  backend: string,
  err: unknown,
  status?: number,
): SearchResult => ({
  results: [],
  suggestions: [],
  error: toSearchError(backend, err, status),
});

export const fetchJsonWithRetry = async <T>(
  input: string | URL,
  init: RequestInit,
  options: FetchJsonOptions,
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? 10000;
  const retries = options.retries ?? 1;
  const context: RequestLogContext = {
    requestId: options.requestId || crypto.randomUUID(),
    route: 'search',
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logRequestEvent(context, 'search.fetch.start', {
        backend: options.backend,
        attempt,
      });

      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        const err = new Error(
          `${options.backend} returned ${res.status}: ${errorText || res.statusText}`,
        );

        if (attempt < retries && isRetryableStatus(res.status)) {
          lastError = err;
          logRequestEvent(
            context,
            'search.fetch.retry',
            {
              backend: options.backend,
              attempt,
              status: res.status,
            },
            'warn',
          );
          await delay(250 * (attempt + 1));
          continue;
        }

        throw Object.assign(err, { status: res.status });
      }

      const data = (await res.json()) as T;
      logRequestEvent(context, 'search.fetch.success', {
        backend: options.backend,
        attempt,
      });
      return data;
    } catch (err) {
      lastError = isAbortError(err)
        ? new Error(`${options.backend} search timed out`)
        : err;

      if (attempt < retries) {
        logRequestEvent(
          context,
          'search.fetch.retry',
          {
            backend: options.backend,
            attempt,
            error: serializeError(lastError),
          },
          'warn',
        );
        await delay(250 * (attempt + 1));
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
};
