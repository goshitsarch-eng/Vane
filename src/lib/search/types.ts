export interface SearchOptions {
  count?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  author?: string;
}

export interface SearchResult {
  results: SearchResultItem[];
  suggestions: string[];
}

export interface SearchBackend {
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
}
