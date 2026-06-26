import { createModelListRequest, parseModelListResponse } from "./modelList";
import { OPT_TRANS_GEMINI, OPT_TRANS_OPENAI } from "../config/api";

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
