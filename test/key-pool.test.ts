import assert from "node:assert/strict";
import test from "node:test";
import { ApiKeyPool } from "../src/key-pool.js";
import { ProviderError } from "../src/types.js";

test("randomly selects from currently available keys", { concurrency: false }, () => {
  const originalRandom = Math.random;
  const values = [0.9, 0.1];
  Math.random = () => values.shift() ?? 0;

  try {
    const pool = new ApiKeyPool(["first", "second", "third"]);
    assert.equal(pool.randomAvailable(), "third");
    assert.equal(pool.randomAvailable(), "first");
  } finally {
    Math.random = originalRandom;
  }
});

test("permanently discards authentication and quota failures", () => {
  for (const kind of ["auth", "quota_exhausted"] as const) {
    const pool = new ApiKeyPool(["key"]);
    pool.markFailure("key", new ProviderError("tavily", kind, "failure"));
    assert.equal(pool.randomAvailable(), undefined);
  }
});

test("temporarily excludes a rate-limited key", () => {
  const pool = new ApiKeyPool(["key"]);
  pool.markFailure("key", new ProviderError("brave", "rate_limited", "rate limited", 1_000));
  assert.equal(pool.randomAvailable(), undefined);
});
