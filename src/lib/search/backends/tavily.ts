import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';
import { emptySearchResult, fetchJsonWithRetry } from '../utils';

class TavilyBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.tavilyApiKey', '');

    if (!apiKey) {
      return emptySearchResult(
        'tavily',
        new Error(
          'Tavily API key is not configured. Please add it in Settings > Search.',
        ),
      );
    }

    const body: any = {
      api_key: apiKey,
      query,
      max_results: opts?.count || 10,
      search_depth: 'advanced',
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    };

    if (opts?.includeDomains && opts.includeDomains.length > 0) {
      body.include_domains = opts.includeDomains;
    }

    if (opts?.excludeDomains && opts.excludeDomains.length > 0) {
      body.exclude_domains = opts.excludeDomains;
    }

    try {
      const data = await fetchJsonWithRetry<any>(
        'https://api.tavily.com/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        {
          backend: 'tavily',
          requestId: opts?.requestId,
          timeoutMs: opts?.timeoutMs,
          retries: opts?.retries,
        },
      );

      const results = (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        author: undefined,
      }));

      return {
        results,
        suggestions: [],
      };
    } catch (err: any) {
      return emptySearchResult('tavily', err, err?.status);
    }
  }
}

export default TavilyBackend;
