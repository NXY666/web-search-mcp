import { ProviderError } from "../types.js";
import type { ApiKeyPool } from "../key-pool.js";
import type { ProviderSearchResponse, SearchInput, SearchProvider } from "../types.js";

function tavilyCountry(country?: string): string | undefined {
  if (!country) return undefined;

  const displayName = new Intl.DisplayNames(["en"], { type: "region" }).of(country.toUpperCase());
  return displayName?.toLowerCase();
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }>;
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number.parseFloat(response.headers.get("Retry-After") ?? "");
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined;
}

export class TavilySearchProvider implements SearchProvider {
  public readonly name = "tavily" as const;

  public constructor(
    private readonly keyPool: ApiKeyPool,
    private readonly timeoutMs: number,
  ) {}

  public async search(input: SearchInput): Promise<ProviderSearchResponse> {
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt < this.keyPool.size; attempt += 1) {
      const key = this.keyPool.randomAvailable();
      if (!key) break;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: input.query,
            search_depth: "basic",
            max_results: input.maxResults ?? 5,
            time_range: input.freshness,
            country: tavilyCountry(input.country),
            include_domains: input.includeDomains,
            exclude_domains: input.excludeDomains,
            include_answer: false,
            include_raw_content: false,
            include_images: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw response.status === 400
            ? new ProviderError("tavily", "invalid_request", message)
            : response.status === 401 || response.status === 403
              ? new ProviderError("tavily", "auth", message)
              : response.status === 429
                ? new ProviderError("tavily", "rate_limited", message, retryAfterMs(response))
                : response.status === 432 || response.status === 433
                  ? new ProviderError("tavily", "quota_exhausted", message)
                  : new ProviderError("tavily", "unavailable", message);
        }

        const body = await response.json() as TavilyResponse;
        const results = body.results ?? [];

        return {
          provider: this.name,
          results: results.flatMap((result, index) => result.title && result.url
            ? [{
                rank: index + 1,
                title: result.title,
                url: result.url,
                snippet: result.content ?? "",
                publishedDate: result.published_date,
              }]
            : []),
        };
      } catch (error) {
        const classified = error instanceof ProviderError
          ? error
          : error instanceof DOMException && error.name === "AbortError"
            ? new ProviderError("tavily", "timeout", "Tavily search timed out.")
            : new ProviderError("tavily", "unavailable", error instanceof Error ? error.message : String(error));
        this.keyPool.markFailure(key, classified);
        if (classified.kind === "invalid_request") throw classified;
        lastError = classified;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new ProviderError("tavily", "quota_exhausted", "No Tavily API key is currently available.");
  }
}
