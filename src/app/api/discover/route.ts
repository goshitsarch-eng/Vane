import { searchSearxng } from '@/lib/searxng';
import { search } from '@/lib/search';
import { SearchResultItem } from '@/lib/search/types';

const websitesForTopic = {
  tech: {
    query: ['technology news', 'latest tech', 'AI', 'science and innovation'],
    links: ['techcrunch.com', 'wired.com', 'theverge.com'],
  },
  finance: {
    query: ['finance news', 'economy', 'stock market', 'investing'],
    links: ['bloomberg.com', 'cnbc.com', 'marketwatch.com'],
  },
  art: {
    query: ['art news', 'culture', 'modern art', 'cultural events'],
    links: ['artnews.com', 'hyperallergic.com', 'theartnewspaper.com'],
  },
  sports: {
    query: ['sports news', 'latest sports', 'cricket football tennis'],
    links: ['espn.com', 'bbc.com/sport', 'skysports.com'],
  },
  entertainment: {
    query: ['entertainment news', 'movies', 'TV shows', 'celebrities'],
    links: ['hollywoodreporter.com', 'variety.com', 'deadline.com'],
  },
};

type Topic = keyof typeof websitesForTopic;

type DiscoverResult = {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
};

const toDiscoverResult = (item: SearchResultItem): DiscoverResult => ({
  title: item.title,
  content: item.content,
  url: item.url,
  thumbnail: '',
});

const searchDiscover = async (
  query: string,
): Promise<{ results: DiscoverResult[]; usedFallback: boolean }> => {
  try {
    const searxngResult = await searchSearxng(query, {
      engines: ['bing news'],
      pageno: 1,
      language: 'en',
    });

    return {
      results: searxngResult.results.map((item) => ({
        title: item.title,
        content: item.content ?? '',
        url: item.url,
        thumbnail: item.thumbnail ?? item.thumbnail_src ?? '',
      })),
      usedFallback: false,
    };
  } catch (error) {
    const fallbackResult = await search(query, { count: 10 });

    return {
      results: fallbackResult.results.map(toDiscoverResult),
      usedFallback: true,
    };
  }
};

export const GET = async (req: Request) => {
  try {
    const params = new URL(req.url).searchParams;

    const mode: 'normal' | 'preview' =
      (params.get('mode') as 'normal' | 'preview') || 'normal';
    const topic: Topic = (params.get('topic') as Topic) || 'tech';

    const selectedTopic = websitesForTopic[topic];

    if (!selectedTopic || !['normal', 'preview'].includes(mode)) {
      return Response.json(
        {
          message: 'Invalid discover request.',
          error: 'Unsupported topic or mode',
        },
        { status: 400 },
      );
    }

    let data: DiscoverResult[] = [];
    let fallbackCount = 0;

    if (mode === 'normal') {
      const seenUrls = new Set();

      const results = await Promise.all(
        selectedTopic.links.flatMap((link) =>
          selectedTopic.query.map((query) =>
            searchDiscover(`site:${link} ${query}`),
          ),
        ),
      );

      fallbackCount = results.filter((result) => result.usedFallback).length;
      data = results
        .flat()
        .flatMap((result) => result.results)
        .filter((item) => {
          const url = item.url?.toLowerCase().trim();
          if (seenUrls.has(url)) return false;
          seenUrls.add(url);
          return true;
        })
        .sort(() => Math.random() - 0.5);
    } else {
      const result = await searchDiscover(
        `site:${
          selectedTopic.links[
            Math.floor(Math.random() * selectedTopic.links.length)
          ]
        } ${
          selectedTopic.query[
            Math.floor(Math.random() * selectedTopic.query.length)
          ]
        }`,
      );
      fallbackCount = result.usedFallback ? 1 : 0;
      data = result.results;
    }

    return Response.json(
      {
        blogs: data,
        ...(fallbackCount > 0
          ? {
              warning:
                'Some discover results came from the active search backend and may not include thumbnails.',
              meta: {
                fallbackCount,
              },
            }
          : {}),
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      {
        message: 'An error has occurred',
      },
      {
        status: 500,
      },
    );
  }
};
