export interface AppConfig {
  tavilyApiKeys: string[];
  braveApiKeys: string[];
  timeoutMs: number;
}

function readApiKeys(listName: string, singleName: string): string[] {
  const raw = process.env[listName] ?? process.env[singleName] ?? "";
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    tavilyApiKeys: readApiKeys("TAVILY_API_KEYS", "TAVILY_API_KEY"),
    braveApiKeys: readApiKeys("BRAVE_API_KEYS", "BRAVE_API_KEY"),
    timeoutMs: readPositiveInteger("SEARCH_TIMEOUT_MS", 10_000),
  };

  if (config.tavilyApiKeys.length === 0) {
    throw new Error("Set TAVILY_API_KEY or TAVILY_API_KEYS before starting the server.");
  }
  if (config.braveApiKeys.length === 0) {
    throw new Error("Set BRAVE_API_KEY or BRAVE_API_KEYS before starting the server.");
  }

  return config;
}
