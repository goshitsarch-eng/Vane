import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';
import { emptySearchResult, fetchJsonWithRetry } from '../utils';

class ExaBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.exaApiKey', '');

    if (!apiKey) {
      return emptySearchResult(
        'exa',
        new Error(
          'Exa API key is not configured. Please add it in Settings > Search.',
        ),
      );
    }

    const body: any = {
      query,
      numResults: opts?.count || 10,
      contents: {
        text: true,
        highlights: false,
      },
    };

    if (opts?.includeDomains && opts.includeDomains.length > 0) {
      body.includeDomains = opts.includeDomains;
    }

    if (opts?.excludeDomains && opts.excludeDomains.length > 0) {
      body.excludeDomains = opts.excludeDomains;
    }

    try {
      const data = await fetchJsonWithRetry<any>(
        'https://api.exa.ai/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(body),
        },
        {
          backend: 'exa',
          requestId: opts?.requestId,
          timeoutMs: opts?.timeoutMs,
          retries: opts?.retries,
        },
      );

      const results = (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.text || '',
        author: r.author,
      }));

      return {
        results,
        suggestions: [],
      };
    } catch (err: any) {
      return emptySearchResult('exa', err, err?.status);
    }
  }
}

export default ExaBackend;
