/**
 * Single source of truth for LLM endpoint settings.
 *
 * GitHub Actions turns an unset `vars.LLM_MODEL` into an empty string rather
 * than omitting the variable, so every read normalises blanks (`""`, spaces)
 * back to the default. Keys are trimmed as well: a secret pasted with a
 * trailing newline makes every request fail with HTTP 401.
 */

export const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_LLM_MODEL = "deepseek-chat";

/** Blank-safe env read: whitespace-only values fall back to `fallback`. */
export function readEnv(value: string | undefined | null, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Resolve the chat-completions base URL (explicit option wins over env). */
export function resolveLlmBaseUrl(value?: string | null): string {
  return readEnv(value !== undefined ? value : process.env.LLM_BASE_URL, DEFAULT_LLM_BASE_URL);
}

/** Resolve the model name (explicit option wins over env). */
export function resolveLlmModel(value?: string | null): string {
  return readEnv(value !== undefined ? value : process.env.LLM_MODEL, DEFAULT_LLM_MODEL);
}

/** Trimmed API key, or null when unset/blank. An explicit null stays null. */
export function resolveLlmApiKey(value?: string | null): string | null {
  const raw = value !== undefined
    ? value
    : process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || null;
  return readEnv(raw, "") || null;
}

/** Normalise a base URL into the concrete chat-completions endpoint. */
export function llmEndpoint(baseUrl: string): string {
  const base = readEnv(baseUrl, DEFAULT_LLM_BASE_URL).replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

/** Key shape without the key itself: safe to print in a public Actions log. */
export function describeLlmKey(key: string | null): string {
  return key ? `present(len=${key.length})` : "absent";
}

/** Strips credential-looking strings out of an upstream error body. */
export function redactSecrets(text: string): string {
  return text.replace(/(sk-or|gsk|sk|xai|hk|pk)-[A-Za-z0-9_-]{6,}/g, "$1-***");
}