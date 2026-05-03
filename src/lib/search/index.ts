import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from './types';
import SearxngBackend from './backends/searxng';
import BraveBackend from './backends/brave';
import ExaBackend from './backends/exa';
import TavilyBackend from './backends/tavily';

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
    console.warn(`Unknown search backend "${backendKey}", falling back to searxng`);
    return new SearxngBackend();
  }

  return factory();
};

export const search = async (
  query: string,
  opts?: SearchOptions,
): Promise<SearchResult> => {
  const backend = getActiveSearchBackend();
  return backend.search(query, opts);
};

export type { SearchBackend, SearchOptions, SearchResult };
