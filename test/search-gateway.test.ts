import assert from "node:assert/strict";
import test from "node:test";
import { SearchGateway } from "../src/search-gateway.js";
import { ProviderError } from "../src/types.js";
import type { ProviderSearchResponse, SearchInput, SearchProvider } from "../src/types.js";

class FakeProvider implements SearchProvider {
  public constructor(
    public readonly name: "tavily" | "brave",
    private readonly run: () => Promise<ProviderSearchResponse>,
  ) {}

  public async search(_input: SearchInput): Promise<ProviderSearchResponse> {
    return this.run();
  }
}

const tavilyResult: ProviderSearchResponse = {
  provider: "tavily",
  results: [{ rank: 1, title: "Tavily", url: "https://tavily.com", snippet: "result" }],
};

const braveResult: ProviderSearchResponse = {
  provider: "brave",
  results: [{ rank: 1, title: "Brave", url: "https://brave.com", snippet: "result" }],
};

test("returns Tavily results without querying Brave", async () => {
  let braveCalls = 0;
  const gateway = new SearchGateway(
    new FakeProvider("tavily", async () => tavilyResult),
    new FakeProvider("brave", async () => {
      braveCalls += 1;
      return braveResult;
    }),
  );

  const result = await gateway.search({ query: "MCP" });
  assert.equal(result.provider, "tavily");
  assert.equal(result.fallbackUsed, false);
  assert.equal(braveCalls, 0);
});

test("falls back to Brave when Tavily returns no results", async () => {
  const gateway = new SearchGateway(
    new FakeProvider("tavily", async () => ({ provider: "tavily", results: [] })),
    new FakeProvider("brave", async () => braveResult),
  );

  const result = await gateway.search({ query: "MCP" });
  assert.equal(result.provider, "brave");
  assert.equal(result.fallbackReason, "empty_results");
});

test("falls back to Brave when Tavily is out of quota", async () => {
  const gateway = new SearchGateway(
    new FakeProvider("tavily", async () => {
      throw new ProviderError("tavily", "quota_exhausted", "quota exceeded");
    }),
    new FakeProvider("brave", async () => braveResult),
  );

  const result = await gateway.search({ query: "MCP" });
  assert.equal(result.provider, "brave");
  assert.equal(result.fallbackReason, "tavily_quota_exhausted");
});

test("does not send invalid Tavily requests to Brave", async () => {
  let braveCalls = 0;
  const gateway = new SearchGateway(
    new FakeProvider("tavily", async () => {
      throw new ProviderError("tavily", "invalid_request", "invalid query");
    }),
    new FakeProvider("brave", async () => {
      braveCalls += 1;
      return braveResult;
    }),
  );

  await assert.rejects(() => gateway.search({ query: "MCP" }), ProviderError);
  assert.equal(braveCalls, 0);
});
