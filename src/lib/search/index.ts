import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from './types';
import SearxngBackend from './backends/searxng';
import BraveBackend from './backends/brave';
import ExaBackend from './backends/exa';
import TavilyBackend from './backends/tavily';
import {
  logRequestEvent,
  RequestLogContext,
  serializeError,
} from '@/lib/observability/request';
import { emptySearchResult } from './utils';

const backends: Record<string, () => SearchBackend> = {
  searxng: () => new SearxngBackend(),
  brave: () => new BraveBackend(),
  exa: () => new ExaBackend(),
  tavily: () => new TavilyBackend(),
};

export const getActiveSearchBackend = (): SearchBackend => {
  const backendKey = configManager.getConfig('search.backend', 'searxng');
  const factory = backends[backendKey];

  if (!factory) {
    console.warn(
      `Unknown search backend "${backendKey}", falling back to searxng`,
    );
    return new SearxngBackend();
  }

  return factory();
};

export const search = async (
  query: string,
  opts?: SearchOptions,
): Promise<SearchResult> => {
  const context: RequestLogContext = {
    requestId: opts?.requestId || crypto.randomUUID(),
    route: 'search',
  };
  const backendKey = configManager.getConfig('search.backend', 'searxng');
  const backend = getActiveSearchBackend();

  logRequestEvent(context, 'search.start', {
    backend: backendKey,
    query,
  });

  try {
    const result = await backend.search(query, opts);

    logRequestEvent(
      context,
      result.error ? 'search.error' : 'search.success',
      {
        backend: result.error?.backend || backendKey,
        resultCount: result.results.length,
        error: result.error,
      },
      result.error ? 'warn' : 'info',
    );

    return result;
  } catch (err) {
    logRequestEvent(
      context,
      'search.exception',
      {
        backend: backendKey,
        error: serializeError(err),
      },
      'error',
    );

    return emptySearchResult(backendKey, err);
  }
};

export type { SearchBackend, SearchOptions, SearchResult };
