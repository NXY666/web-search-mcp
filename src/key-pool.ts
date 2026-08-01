import { ProviderError } from "./types.js";
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

export class ApiKeyPool {
  private readonly unavailableUntil = new Map<string, number>();
  private readonly discarded = new Set<string>();

  public constructor(
    private readonly keys: readonly string[],
  ) {}

  public get size(): number {
    return this.keys.length;
  }

  public randomAvailable(): string | undefined {
    const now = Date.now();
    const availableKeys = this.keys.filter((key) =>
      !this.discarded.has(key) && (this.unavailableUntil.get(key) ?? 0) <= now,
    );
    return availableKeys[Math.floor(Math.random() * availableKeys.length)];
  }

  public markFailure(key: string, error: ProviderError): void {
    if (error.kind === "auth" || error.kind === "quota_exhausted") {
      this.discarded.add(key);
      return;
    }

    const cooldownMs = error.kind === "rate_limited"
      ? error.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    this.unavailableUntil.set(key, Date.now() + cooldownMs);
  }
}
