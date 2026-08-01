import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { loadConfig } from "./config.js";
import { ApiKeyPool } from "./key-pool.js";
import { BraveSearchProvider } from "./providers/brave.js";
import { TavilySearchProvider } from "./providers/tavily.js";
import { SearchGateway } from "./search-gateway.js";
import { ProviderError } from "./types.js";

const config = loadConfig();
const tavilyPool = new ApiKeyPool(config.tavilyApiKeys);
const bravePool = new ApiKeyPool(config.braveApiKeys);
const gateway = new SearchGateway(
  new TavilySearchProvider(tavilyPool, config.timeoutMs),
  new BraveSearchProvider(bravePool, config.timeoutMs),
);

const server = new McpServer({
  name: "web-search",
  version: "0.1.0",
});

server.registerTool(
  "web_search",
  {
    description: "Search the web. Tavily is used first; Brave is used only when Tavily is unavailable, out of quota, rate-limited, or returns no results.",
    inputSchema: {
      query: z.string().trim().min(1).max(400).describe("The web-search query."),
      max_results: z.number().int().min(1).max(20).optional().describe("Maximum number of results. Defaults to 5."),
      freshness: z.enum(["day", "week", "month", "year"]).optional().describe("Only return recently published or updated results."),
      country: z.string().regex(/^[A-Za-z]{2}$/).optional().describe("ISO 3166-1 alpha-2 country code, such as CN or US."),
      include_domains: z.array(z.string().regex(/^[A-Za-z0-9.-]+$/).max(253)).max(20).optional().describe("Only search these domains."),
      exclude_domains: z.array(z.string().regex(/^[A-Za-z0-9.-]+$/).max(253)).max(20).optional().describe("Exclude these domains."),
    },
  },
  async (input) => {
    try {
      const result = await gateway.search({
        query: input.query,
        maxResults: input.max_results,
        freshness: input.freshness,
        country: input.country,
        includeDomains: input.include_domains,
        excludeDomains: input.exclude_domains,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      const message = error instanceof ProviderError
        ? `${error.provider} ${error.kind}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
