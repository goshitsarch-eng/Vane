import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';
import { emptySearchResult, fetchJsonWithRetry } from '../utils';

class BraveBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.braveApiKey', '');

    if (!apiKey) {
      return emptySearchResult(
        'brave',
        new Error(
          'Brave Search API key is not configured. Please add it in Settings > Search.',
        ),
      );
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', String(opts?.count || 10));
    url.searchParams.append('offset', '0');

    try {
      const data = await fetchJsonWithRetry<any>(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
          },
        },
        {
          backend: 'brave',
          requestId: opts?.requestId,
          timeoutMs: opts?.timeoutMs,
          retries: opts?.retries,
        },
      );

      const results = (data.web?.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.description || '',
        author: r.profile?.name,
      }));

      return {
        results,
        suggestions:
          data.query?.autocompletions?.map((a: any) => a.query) || [],
      };
    } catch (err: any) {
      return emptySearchResult('brave', err, err?.status);
    }
  }
}

export default BraveBackend;
