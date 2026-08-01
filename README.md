# @greatnxy/web-search-mcp

A focused MCP server that gives your MCP client a straightforward way to search the web and receive structured results through a single tool: `web_search`.

This server integrates with Tavily and Brave because both services provide free usage options, making it practical to get started with web search. See their plans and pricing: [Tavily Plans & Pricing](https://www.tavily.com/pricing) · [Brave Search API Plans](https://brave.com/search/api/).

## Install and run

```powershell
npm install
$env:TAVILY_API_KEY = "tvly-..."
$env:BRAVE_API_KEY = "BSA..."
npm run build
npm start
```

> [!WARNING]
> If you want to use only Brave's free quota, be sure to set a usage limit for your Brave Search account. Configure it in [Brave Search usage limits](https://api-dashboard.search.brave.com/app/subscriptions/usage-limits).

For key rotation within each provider, use comma-separated values.

```powershell
$env:TAVILY_API_KEYS = "tvly-first,tvly-second"
$env:BRAVE_API_KEYS = "brave-first,brave-second"
```

Keys are chosen randomly from each provider's currently available pool. A 429 pauses that Key until the provider's response says it can be retried. An authentication or quota error removes the Key until the server is restarted.

## VS Code configuration

Create or edit your MCP configuration and keep secrets in password inputs:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "tavily-api-key",
      "description": "Tavily API key",
      "password": true
    },
    {
      "type": "promptString",
      "id": "brave-api-key",
      "description": "Brave Search API key",
      "password": true
    }
  ],
  "servers": {
    "web-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@greatnxy/web-search-mcp"],
      "env": {
        "TAVILY_API_KEY": "${input:tavily-api-key}",
        "BRAVE_API_KEY": "${input:brave-api-key}"
      }
    }
  }
}
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TAVILY_API_KEY` / `TAVILY_API_KEYS` | required | One key or a comma-separated Tavily key pool. |
| `BRAVE_API_KEY` / `BRAVE_API_KEYS` | required | One key or a comma-separated Brave key pool. |
| `SEARCH_TIMEOUT_MS` | `10000` | Tavily and Brave HTTP request timeout. |

## Search behavior

The gateway calls Tavily first. It calls Brave when Tavily returns no results, times out, is unavailable, is rate-limited, or reports exhausted plan/PAYG quota. Each request randomly selects an available key from the chosen provider's pool.

## Tool input and output

`web_search` accepts `query`, optional `max_results` (1–20), `freshness` (`day`, `week`, `month`, `year`), ISO country code, and include/exclude domain lists.

It returns query, selected provider, fallback state and reason, providers tried, and ranked `title`/`url`/`snippet` results.

## Verify

```powershell
npm run check
npm test
npm run build
```
