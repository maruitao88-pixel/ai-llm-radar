import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  describeLlmKey,
  llmEndpoint,
  readEnv,
  redactSecrets,
  resolveLlmApiKey,
  resolveLlmBaseUrl,
  resolveLlmModel,
} from "../scripts/lib/llmConfig";

const savedBase = process.env.LLM_BASE_URL;
const savedModel = process.env.LLM_MODEL;
const savedKey = process.env.LLM_API_KEY;
const savedDeepseek = process.env.DEEPSEEK_API_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("LLM_BASE_URL", savedBase);
  restore("LLM_MODEL", savedModel);
  restore("LLM_API_KEY", savedKey);
  restore("DEEPSEEK_API_KEY", savedDeepseek);
});

describe("readEnv", () => {
  it("falls back when the value is undefined or null", () => {
    expect(readEnv(undefined, "fallback")).toBe("fallback");
    expect(readEnv(null, "fallback")).toBe("fallback");
  });

  it("treats empty and whitespace-only values as missing", () => {
    expect(readEnv("", "fallback")).toBe("fallback");
    expect(readEnv("   ", "fallback")).toBe("fallback");
    expect(readEnv("\n\t ", "fallback")).toBe("fallback");
  });

  it("trims surrounding whitespace from real values", () => {
    expect(readEnv("  deepseek-chat  ", "fallback")).toBe("deepseek-chat");
  });
});

describe("resolveLlmBaseUrl / resolveLlmModel", () => {
  it("uses the default when neither option nor env is set", () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    expect(resolveLlmBaseUrl()).toBe(DEFAULT_LLM_BASE_URL);
    expect(resolveLlmModel()).toBe(DEFAULT_LLM_MODEL);
  });

  it("ignores a blank env var, matching how GitHub Actions injects unset vars", () => {
    process.env.LLM_BASE_URL = "";
    process.env.LLM_MODEL = "   ";
    expect(resolveLlmBaseUrl()).toBe(DEFAULT_LLM_BASE_URL);
    expect(resolveLlmModel()).toBe(DEFAULT_LLM_MODEL);
  });

  it("prefers an explicit option over the env var", () => {
    process.env.LLM_BASE_URL = "https://env.example.com";
    expect(resolveLlmBaseUrl("https://option.example.com")).toBe("https://option.example.com");
  });
});

describe("resolveLlmApiKey", () => {
  it("returns null when unset", () => {
    delete process.env.LLM_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    expect(resolveLlmApiKey()).toBeNull();
  });

  it("trims a pasted key and drops surrounding whitespace", () => {
    expect(resolveLlmApiKey("  sk-abc123  ")).toBe("sk-abc123");
  });

  it("treats a blank key as absent", () => {
    expect(resolveLlmApiKey("")).toBeNull();
    expect(resolveLlmApiKey("   ")).toBeNull();
  });

  it("honours an explicit null over a present env var", () => {
    process.env.LLM_API_KEY = "sk-env";
    expect(resolveLlmApiKey(null)).toBeNull();
  });

  it("falls back to DEEPSEEK_API_KEY when LLM_API_KEY is blank", () => {
    process.env.LLM_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "sk-deepseek";
    expect(resolveLlmApiKey()).toBe("sk-deepseek");
  });
});

describe("llmEndpoint", () => {
  it("appends /chat/completions to a bare base URL", () => {
    expect(llmEndpoint("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("strips trailing slashes before appending", () => {
    expect(llmEndpoint("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("leaves an already-complete endpoint untouched", () => {
    expect(llmEndpoint("https://api.deepseek.com/chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("accepts a /v1 base path", () => {
    expect(llmEndpoint("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });
});

describe("describeLlmKey", () => {
  it("never leaks the key, only its presence and length", () => {
    expect(describeLlmKey(null)).toBe("absent");
    const described = describeLlmKey("sk-supersecretvalue");
    expect(described).toBe("present(len=19)");
    expect(described).not.toContain("supersecret");
  });
});

describe("redactSecrets", () => {
  it("masks DeepSeek-style keys", () => {
    expect(redactSecrets("Authorization failed for sk-abcdef123456")).toBe(
      "Authorization failed for sk-***",
    );
  });

  it("masks other provider key shapes", () => {
    expect(redactSecrets("gsk-abcdef123456")).toBe("gsk-***");
    expect(redactSecrets("sk-or-v1-abcdef123456")).toBe("sk-or-***");
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("HTTP 401 invalid api key")).toBe("HTTP 401 invalid api key");
  });
});