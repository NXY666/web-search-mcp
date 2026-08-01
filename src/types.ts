export type ProviderName = "tavily" | "brave";

export type Freshness = "day" | "week" | "month" | "year";

export interface SearchInput {
  query: string;
  maxResults?: number;
  freshness?: Freshness;
  country?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchResult {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ProviderSearchResponse {
  provider: ProviderName;
  results: SearchResult[];
  moreResultsAvailable?: boolean;
}

export type ProviderFailureKind =
  | "auth"
  | "invalid_request"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "unavailable";

export class ProviderError extends Error {
  public readonly retryAfterMs?: number;

  public constructor(
    public readonly provider: ProviderName,
    public readonly kind: ProviderFailureKind,
    message: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface SearchProvider {
  readonly name: ProviderName;
  search(input: SearchInput): Promise<ProviderSearchResponse>;
}

export type FallbackReason =
  | "empty_results"
  | "tavily_unavailable"
  | "tavily_rate_limited"
  | "tavily_quota_exhausted";

export interface UnifiedSearchResponse extends Record<string, unknown> {
  query: string;
  provider: ProviderName;
  fallbackUsed: boolean;
  fallbackReason?: FallbackReason;
  providersTried: ProviderName[];
  results: SearchResult[];
  moreResultsAvailable?: boolean;
}
