import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';

class TavilyBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.tavilyApiKey', '');

    if (!apiKey) {
      throw new Error(
        'Tavily API key is not configured. Please add it in Settings > Search.',
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Tavily error: ${errorText}`);
      }

      const data = await res.json();

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
      if (err.name === 'AbortError') {
        throw new Error('Tavily search timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default TavilyBackend;
