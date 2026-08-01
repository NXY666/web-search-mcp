import { ProviderError } from "../types.js";
import type { ApiKeyPool } from "../key-pool.js";
import type { ProviderSearchResponse, SearchInput, SearchProvider } from "../types.js";

const FRESHNESS_MAP = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
} as const;

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveResponse {
  query?: { more_results_available?: boolean };
  web?: { results?: BraveWebResult[] };
}

function toBraveQuery(input: SearchInput): string {
  const filters = [
    ...(input.includeDomains ?? []).map((domain) => `site:${domain}`),
    ...(input.excludeDomains ?? []).map((domain) => `-site:${domain}`),
  ];
  const query = [input.query, ...filters].join(" ");
  if (query.length > 400) {
    throw new ProviderError("brave", "invalid_request", "Query including domain filters exceeds Brave's 400-character limit.");
  }
  return query;
}

function retryAfterMs(response: Response): number | undefined {
  const remaining = (response.headers.get("X-RateLimit-Remaining") ?? "").split(",").map(Number);
  const resets = (response.headers.get("X-RateLimit-Reset") ?? "").split(",").map(Number);
  const seconds = Math.max(...remaining.flatMap((value, index) =>
    value <= 0 && Number.isFinite(resets[index]) ? [resets[index]] : [],
  ));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined;
}

export class BraveSearchProvider implements SearchProvider {
  public readonly name = "brave" as const;

  public constructor(
    private readonly keyPool: ApiKeyPool,
    private readonly timeoutMs: number,
  ) {}

  public async search(input: SearchInput): Promise<ProviderSearchResponse> {
    const query = toBraveQuery(input);
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt < this.keyPool.size; attempt += 1) {
      const key = this.keyPool.randomAvailable();
      if (!key) break;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const parameters = new URLSearchParams({ q: query, count: String(input.maxResults ?? 5) });
        if (input.country) parameters.set("country", input.country.toUpperCase());
        if (input.freshness) parameters.set("freshness", FRESHNESS_MAP[input.freshness]);

        const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${parameters}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": key,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text();
          throw response.status === 401 || response.status === 403
            ? new ProviderError("brave", "auth", body)
            : response.status === 422
              ? new ProviderError("brave", "invalid_request", body)
              : response.status === 429
                ? new ProviderError("brave", "rate_limited", body, retryAfterMs(response))
                : new ProviderError("brave", "unavailable", body);
        }

        const body = await response.json() as BraveResponse;
        const results = body.web?.results ?? [];
        return {
          provider: this.name,
          results: results.flatMap((result, index) => result.title && result.url
            ? [{
                rank: index + 1,
                title: result.title,
                url: result.url,
                snippet: result.description ?? "",
                publishedDate: result.age,
              }]
            : []),
          moreResultsAvailable: body.query?.more_results_available,
        };
      } catch (error) {
        const classified = error instanceof ProviderError
          ? error
          : error instanceof DOMException && error.name === "AbortError"
            ? new ProviderError("brave", "timeout", "Brave search timed out.")
            : new ProviderError("brave", "unavailable", error instanceof Error ? error.message : String(error));
        this.keyPool.markFailure(key, classified);
        if (classified.kind === "invalid_request") throw classified;
        lastError = classified;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new ProviderError("brave", "quota_exhausted", "No Brave API key is currently available.");
  }
}
