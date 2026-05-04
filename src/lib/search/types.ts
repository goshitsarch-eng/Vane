export interface SearchOptions {
  count?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
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
  error?: SearchError;
}

export interface SearchError {
  backend: string;
  message: string;
  status?: number;
  retryable?: boolean;
}

export interface SearchBackend {
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
}
