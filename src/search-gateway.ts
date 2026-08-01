import { ProviderError } from "./types.js";
import type {
  FallbackReason,
  ProviderSearchResponse,
  SearchInput,
  SearchProvider,
  UnifiedSearchResponse,
} from "./types.js";

function fallbackReason(error: ProviderError): FallbackReason | undefined {
  switch (error.kind) {
    case "quota_exhausted":
      return "tavily_quota_exhausted";
    case "rate_limited":
      return "tavily_rate_limited";
    case "auth":
    case "timeout":
    case "unavailable":
      return "tavily_unavailable";
    default:
      return undefined;
  }
}

function toUnified(
  query: string,
  response: ProviderSearchResponse,
  fallbackUsed: boolean,
  providersTried: ("tavily" | "brave")[],
  reason?: FallbackReason,
): UnifiedSearchResponse {
  return {
    query,
    provider: response.provider,
    fallbackUsed,
    fallbackReason: reason,
    providersTried,
    results: response.results,
    moreResultsAvailable: response.moreResultsAvailable,
  };
}

export class SearchGateway {
  public constructor(
    private readonly tavily: SearchProvider,
    private readonly brave: SearchProvider,
  ) {}

  public async search(input: SearchInput): Promise<UnifiedSearchResponse> {
    const providersTried: ("tavily" | "brave")[] = ["tavily"];

    try {
      const tavilyResponse = await this.tavily.search(input);
      if (tavilyResponse.results.length > 0) {
        return toUnified(input.query, tavilyResponse, false, providersTried);
      }
      return this.searchBrave(input, providersTried, "empty_results");
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      if (error.kind === "invalid_request") throw error;

      return this.searchBrave(input, providersTried, fallbackReason(error) ?? "tavily_unavailable");
    }
  }

  private async searchBrave(
    input: SearchInput,
    providersTried: ("tavily" | "brave")[],
    reason: FallbackReason,
  ): Promise<UnifiedSearchResponse> {
    providersTried.push("brave");
    const braveResponse = await this.brave.search(input);
    return toUnified(input.query, braveResponse, true, providersTried, reason);
  }
}
