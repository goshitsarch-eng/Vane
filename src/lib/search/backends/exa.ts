import configManager from '@/lib/config';
import { SearchBackend, SearchOptions, SearchResult } from '../types';

class ExaBackend implements SearchBackend {
  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const apiKey = configManager.getConfig('search.exaApiKey', '');

    if (!apiKey) {
      throw new Error(
        'Exa API key is not configured. Please add it in Settings > Search.',
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Exa error: ${errorText}`);
      }

      const data = await res.json();

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
      if (err.name === 'AbortError') {
        throw new Error('Exa search timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default ExaBackend;
