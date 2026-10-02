// vitest mock for `cloudflare:workers` — vinext/Workers built-in.
// In Workers runtime, `env.DB` is the D1 binding; in tests, no DB (fallback to GeoJSON).
export const env: Record<string, unknown> = {};
