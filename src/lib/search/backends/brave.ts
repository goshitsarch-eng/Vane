import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';

class BraveBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.braveApiKey', '');

    if (!apiKey) {
      throw new Error(
        'Brave Search API key is not configured. Please add it in Settings > Search.',
      );
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', String(opts?.count || 10));
    url.searchParams.append('offset', '0');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Brave Search error: ${errorText}`);
      }

      const data = await res.json();

      const results = (data.web?.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.description || '',
        author: r.profile?.name,
      }));

      return {
        results,
        suggestions: data.query?.autocompletions?.map((a: any) => a.query) || [],
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Brave Search timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default BraveBackend;
