import { searchSearxng } from '@/lib/searxng';
import { SearchBackend, SearchOptions, SearchResult } from '../types';

class SearxngBackend implements SearchBackend {
  async search(query: string, _opts?: SearchOptions): Promise<SearchResult> {
    const res = await searchSearxng(query);

    return {
      results: res.results.map((r) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        author: r.author,
      })),
      suggestions: res.suggestions,
    };
  }
}

export default SearxngBackend;
