import {
  createModelListRequest,
  parseModelCatalogResponse,
  parseModelListResponse,
} from "./modelList";
import {
  OPT_TRANS_CLAUDE,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENAI,
} from "../config/api";

const anthropicHeaders = (key) => ({
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

describe("modelList", () => {
  test("parses OpenAI-compatible model lists", () => {
    expect(
      parseModelListResponse({
        data: [
          { id: "gpt-4o" },
          { id: "gpt-4o" },
          { id: "deepseek-chat" },
          { id: "" },
        ],
      })
    ).toEqual(["gpt-4o", "deepseek-chat"]);
  });

  test("uses OpenRouter model IDs instead of also listing display names", () => {
    expect(
      parseModelListResponse({
        data: [
          {
            id: "qwen/qwen3.7-flash",
            name: "Qwen: Qwen3.7 Flash",
          },
          {
            id: "anthropic/claude-opus-5-fast",
            name: "Claude Opus 5 (Fast)",
          },
        ],
      })
    ).toEqual(["qwen/qwen3.7-flash", "anthropic/claude-opus-5-fast"]);
  });

  test("preserves OpenRouter reasoning capabilities by model ID", () => {
    expect(
      parseModelCatalogResponse({
        data: [
          {
            id: "google/gemini-3.5-flash",
            reasoning: {
              supported_efforts: ["high", "medium", "low", "minimal"],
              default_effort: "medium",
              default_enabled: true,
              mandatory: true,
            },
          },
        ],
      })
    ).toEqual({
      models: ["google/gemini-3.5-flash"],
      thinkingCapabilities: {
        "google/gemini-3.5-flash": {
          model: "google/gemini-3.5-flash",
          supportedEfforts: ["high", "medium", "low", "minimal"],
          defaultEffort: "medium",
          defaultEnabled: true,
          mandatory: true,
        },
      },
    });
  });

  test("parses Gemini model lists", () => {
    expect(
      parseModelListResponse({
        models: [
          { name: "models/gemini-2.5-flash" },
          { baseModelId: "gemini-2.5-pro" },
        ],
      })
    ).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });

  test("parses Ollama-style model lists", () => {
    expect(
      parseModelListResponse({
        models: [{ name: "llama3.1" }, { name: "qwen2.5:7b" }],
      })
    ).toEqual(["llama3.1", "qwen2.5:7b"]);
  });

  test("returns an empty list for invalid responses", () => {
    expect(parseModelListResponse(null)).toEqual([]);
    expect(parseModelListResponse({ data: "invalid" })).toEqual([]);
  });

  test("builds bearer auth requests by default", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_OPENAI,
        modelListUrl: "https://api.openai.com/v1/models",
        key: "sk-test",
      })
    ).toEqual({
      input: "https://api.openai.com/v1/models",
      init: {
        method: "GET",
        headers: {
          Authorization: "Bearer sk-test",
        },
      },
    });
  });

  test("builds Anthropic requests with the required version header", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_CLAUDE,
        modelListUrl: " https://api.anthropic.com/v1/models ",
        key: " sk-ant-test ",
      })
    ).toEqual({
      input: "https://api.anthropic.com/v1/models",
      init: { method: "GET", headers: anthropicHeaders("sk-ant-test") },
    });
  });

  test("uses Anthropic headers for Claude-protocol proxies", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_CLAUDE,
        modelListUrl: "https://claude-proxy.example.com/v1/models",
        key: "proxy-key",
      })
    ).toEqual({
      input: "https://claude-proxy.example.com/v1/models",
      init: { method: "GET", headers: anthropicHeaders("proxy-key") },
    });
  });

  test("uses Anthropic headers for the official URL regardless of apiType", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_OPENAI,
        modelListUrl: "https://api.anthropic.com/v1/models?limit=1000",
        key: "sk-ant-test",
      })
    ).toEqual({
      input: "https://api.anthropic.com/v1/models?limit=1000",
      init: { method: "GET", headers: anthropicHeaders("sk-ant-test") },
    });
  });

  test("parses Anthropic model lists", () => {
    expect(
      parseModelListResponse({
        data: [
          {
            type: "model",
            id: "claude-haiku-5-5",
            display_name: "Claude Haiku 5.5",
          },
          { type: "model", id: "claude-sonnet-5-5" },
        ],
        has_more: false,
      })
    ).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
  });

  test("builds Gemini key query requests", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_GEMINI,
        modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
        key: "gemini-key",
      })
    ).toEqual({
      input:
        "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
      init: {
        method: "GET",
      },
    });
  });

  test("builds Gemini key query requests for native Gemini URLs regardless of apiType", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_GEMINI_2,
        modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
        key: "gemini-key",
      })
    ).toEqual({
      input:
        "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
      init: {
        method: "GET",
      },
    });
  });

  test("builds bearer auth requests for Gemini2 OpenAI-compatible model list URL", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_GEMINI_2,
        modelListUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai/models",
        key: "gemini-key",
      })
    ).toEqual({
      input: "https://generativelanguage.googleapis.com/v1beta/openai/models",
      init: {
        method: "GET",
        headers: {
          Authorization: "Bearer gemini-key",
        },
      },
    });
  });

  test("uses key placeholder without extra authorization", () => {
    expect(
      createModelListRequest({
        apiType: OPT_TRANS_OPENAI,
        modelListUrl: "https://example.com/models?api_key={{key}}",
        key: "key with space",
      })
    ).toEqual({
      input: "https://example.com/models?api_key=key%20with%20space",
      init: {
        method: "GET",
      },
    });
  });
});
