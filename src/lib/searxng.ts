import { getSearxngURL } from './config/serverRegistry';
import { fetchJsonWithRetry } from './search/utils';

export interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
}

interface SearxngSearchResult {
  title: string;
  url: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  iframe_src?: string;
}

export const searchSearxng = async (
  query: string,
  opts?: SearxngSearchOptions,
) => {
  const searxngURL = getSearxngURL();
  if (!searxngURL) {
    throw new Error(
      'SearXNG URL is not configured. Please add it in Settings > Search.',
    );
  }

  const url = new URL(`${searxngURL}/search?format=json`);
  url.searchParams.append('q', query);

  if (opts) {
    Object.keys(opts).forEach((key) => {
      if (key === 'requestId' || key === 'timeoutMs' || key === 'retries') {
        return;
      }

      const value = opts[key as keyof SearxngSearchOptions];
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(','));
        return;
      }
      url.searchParams.append(key, value as string);
    });
  }

  const data = await fetchJsonWithRetry<{
    results?: SearxngSearchResult[];
    suggestions?: string[];
  }>(
    url,
    {},
    {
      backend: 'searxng',
      requestId: opts?.requestId,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    },
  );

  return {
    results: data.results || [],
    suggestions: data.suggestions || [],
  };
};
