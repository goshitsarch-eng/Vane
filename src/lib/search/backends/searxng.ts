import { searchSearxng } from '@/lib/searxng';
import { SearchBackend, SearchOptions, SearchResult } from '../types';
import { emptySearchResult } from '../utils';

class SearxngBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    try {
      const res = await searchSearxng(query, {
        requestId: opts?.requestId,
        timeoutMs: opts?.timeoutMs,
        retries: opts?.retries,
      });

      return {
        results: (res.results || []).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          content: r.content || '',
          author: r.author,
        })),
        suggestions: res.suggestions || [],
      };
    } catch (err: any) {
      return emptySearchResult('searxng', err, err?.status);
    }
  }
}

export default SearxngBackend;
