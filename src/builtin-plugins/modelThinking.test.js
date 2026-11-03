import { genOpenAI } from "./openai-compat";
import { genClaude } from "./claude";
import { genGemini, genGemini2 } from "./gemini";
import { genOllama } from "./ollama";
import { genOrcaRouter, genRequesty } from "./routers";
import { createBuiltinInstance, withBuiltinProvider } from "./index";
import {
  normalizeApiThinkingSetting,
  normalizeApiThinkingSettings,
  getThinkingCapability,
} from "./thinkingCapabilities";
import {
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_INTERACTIONS_URL,
} from "../config/apiConstants";

const build = (apiType, model, thinkingMode, extra = {}) => {
  const options = normalizeApiThinkingSetting({
    apiType,
    model,
    thinkingMode,
    thinkingEffort: "_default",
    url:
      apiType === "Gemini"
        ? GEMINI_INTERACTIONS_URL
        : "https://example.test/v1/chat/completions",
    key: "test",
    systemPrompt: "Translate",
    userPrompt: "Hello",
    temperature: 0.7,
    maxTokens: 20480,
    ...extra,
  });
  const builder =
    {
      Claude: genClaude,
      Gemini: genGemini,
      Gemini2: genGemini2,
      Ollama: genOllama,
      OrcaRouter: genOrcaRouter,
      Requesty: genRequesty,
    }[apiType] || genOpenAI;
  return builder(options).body;
};
const thinkingFields = (body) =>
  Object.fromEntries(
    [
      "thinking",
      "reasoning_effort",
      "enable_thinking",
      "thinking_budget",
      "output_config",
    ]
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]])
  );

const toggleCases = [
  ["DeepSeek", "deepseek-flash"],
  ["DeepSeek", "deepseek-v4-flash"],
  ["OpenCodeGo", "deepseek-v4.1-flash"],
  ["XiaomiMimo", "mimo-v2.6-flash"],
  ["XiaomiMimo", "mimo-v2.6-pro"],
  ["XiaomiMimo", "mimo-v2.6-pro-ultraspeed"],
  ["XiaomiMimo", "mimo-v2.5-pro"],
  ["OpenCodeGo", "mimo-v2.6-flash"],
  ["Zai", "glm-4.7-flash"],
  ["Zai", "glm-5.1"],
  ["Zai", "glm-5.2"],
];
test.each(toggleCases)(
  "%s/%s emits the vendor toggle in all three modes",
  (apiType, model) => {
    expect(thinkingFields(build(apiType, model, "disabled"))).toEqual({
      thinking: { type: "disabled" },
    });
    expect(thinkingFields(build(apiType, model, "enabled"))).toEqual({
      thinking: { type: "enabled" },
    });
    expect(
      thinkingFields(build(apiType, model, "auto", { thinkingEffort: "max" }))
    ).toEqual({});
  }
);

test.each([
  "qwen3.8-flash",
  "qwen3.8-max",
  "qwen3.8-27b",
  "qwen3.7-plus",
  "qwen3.7-flash",
  "qwen3.6-plus",
  "qwen3.5-flash",
  "qwen-plus",
])("Bailian %s uses enable_thinking", (model) => {
  expect(thinkingFields(build("AliyunBailian", model, "disabled"))).toEqual({
    enable_thinking: false,
  });
  expect(thinkingFields(build("AliyunBailian", model, "enabled"))).toEqual({
    enable_thinking: true,
  });
  expect(thinkingFields(build("AliyunBailian", model, "auto"))).toEqual({});
});

test.each(["qwen3.8-2.4t-a95b", "qwen3.7-max-preview"])(
  "Bailian %s cannot be switched off",
  (model) => {
    expect(
      getThinkingCapability({ apiType: "AliyunBailian", model }).disable
    ).toBeNull();
    for (const mode of ["enabled", "disabled", "auto"])
      expect(thinkingFields(build("AliyunBailian", model, mode))).toEqual({});
  }
);

test.each(["Qwen/Qwen3.6-35B-A3B", "Qwen/Qwen3.8-27B", "Pro/zai-org/GLM-4.7"])(
  "SiliconFlow %s uses platform controls",
  (model) => {
    expect(thinkingFields(build("SiliconFlow", model, "disabled"))).toEqual({
      enable_thinking: false,
    });
    expect(thinkingFields(build("SiliconFlow", model, "enabled"))).toEqual({
      enable_thinking: true,
    });
    expect(
      thinkingFields(
        build("SiliconFlow", model, "enabled", { thinkingEffort: "low" })
      )
    ).toEqual({ enable_thinking: true, thinking_budget: 4096 });
    expect(thinkingFields(build("SiliconFlow", model, "auto"))).toEqual({});
  }
);

test.each(["OpenAI", "OrcaRouter", "Requesty", "ePhoneAI", "APIMart"])(
  "%s supports the current OpenAI models without guessing other vendors",
  (apiType) => {
    for (const model of ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-terra"]) {
      const name = ["OrcaRouter", "Requesty"].includes(apiType)
        ? "openai/" + model
        : model;
      const disabled = build(apiType, name, "disabled");
      expect(disabled.reasoning_effort).toBe("none");
      expect(disabled.temperature).toBe(0.7);
      expect(build(apiType, name, "enabled").temperature).toBeUndefined();
      expect(build(apiType, name, "auto")).not.toHaveProperty(
        "reasoning_effort"
      );
      expect(build(apiType, name, "auto").temperature).toBeUndefined();
      expect(
        build(apiType, name, "enabled", { thinkingEffort: "high" })
          .reasoning_effort
      ).toBe("high");
    }
  }
);

test.each([
  ["OpenAI", "gpt-6-astra", "low"],
  ["OpenAI", "gpt-6.1-sol", "low"],
  ["OpenAI", "gpt-5", "minimal"],
  ["OpenAI", "gpt-5.4-pro", "medium"],
  ["Cerebras", "gpt-oss-120b", "low"],
  ["Cerebras", "zai-glm-5.3-flash", "low"],
  ["Ollama", "gpt-oss:20b", "low"],
])(
  "%s/%s uses minimum effort instead of a false disable",
  (apiType, model, effort) => {
    expect(thinkingFields(build(apiType, model, "disabled"))).toEqual({
      reasoning_effort: effort,
    });
    expect(build(apiType, model, "auto")).not.toHaveProperty(
      "reasoning_effort"
    );
    expect(
      build(apiType, model, "enabled", { thinkingEffort: "high" })
        .reasoning_effort
    ).toBe("high");
  }
);

test.each(["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx"])(
  "Zai %s requires thinking and rejects medium effort",
  (model) => {
    expect(thinkingFields(build("Zai", model, "disabled"))).toEqual({
      thinking: { type: "enabled" },
      reasoning_effort: "low",
    });
    expect(thinkingFields(build("Zai", model, "auto"))).toEqual({});
    expect(
      thinkingFields(
        build("Zai", model, "enabled", { thinkingEffort: "medium" })
      )
    ).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high" });
  }
);

test("SiliconFlow keeps mandatory models honest when platform effort controls are unconfirmed", () => {
  for (const mode of ["enabled", "disabled", "auto"])
    expect(
      thinkingFields(build("SiliconFlow", "zai-org/GLM-5.3-Flash", mode))
    ).toEqual({});
  expect(
    getThinkingCapability({
      apiType: "SiliconFlow",
      model: "zai-org/GLM-5.3-Flash",
    })
  ).toMatchObject({ disable: null, efforts: null });
});

test("SiliconFlow uses reasoning_effort for its V4 and GLM 5.2 deployments", () => {
  for (const model of [
    "Pro/deepseek-ai/DeepSeek-V4",
    "deepseek-ai/DeepSeek-V4-Flash",
    "Pro/zai-org/GLM-5.2",
  ]) {
    expect(thinkingFields(build("SiliconFlow", model, "disabled"))).toEqual({
      enable_thinking: false,
    });
    expect(
      thinkingFields(
        build("SiliconFlow", model, "enabled", { thinkingEffort: "max" })
      )
    ).toEqual({ enable_thinking: true, reasoning_effort: "max" });
    expect(thinkingFields(build("SiliconFlow", model, "auto"))).toEqual({});
  }
});

test.each(["qwen3.5:4b", "qwen3:8b", "qwen3.8:27b"])(
  "Ollama %s uses its compatibility effort instead of vendor fields",
  (model) => {
    expect(thinkingFields(build("Ollama", model, "disabled"))).toEqual({
      reasoning_effort: "none",
    });
    expect(thinkingFields(build("Ollama", model, "enabled"))).toEqual({});
    expect(thinkingFields(build("Ollama", model, "auto"))).toEqual({});
  }
);

test.each([
  "claude-haiku-5-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-opus-4-8",
])("Claude %s supports disabling without stale high effort", (model) => {
  expect(
    thinkingFields(
      build("Claude", model, "disabled", { thinkingEffort: "max" })
    )
  ).toEqual({ thinking: { type: "disabled" } });
  expect(
    thinkingFields(build("Claude", model, "enabled", { thinkingEffort: "max" }))
  ).toEqual({
    thinking: { type: "adaptive" },
    output_config: { effort: "max" },
  });
  expect(thinkingFields(build("Claude", model, "auto"))).toEqual({});
  expect(build("Claude", model, "disabled")).not.toHaveProperty("temperature");
});

test.each([
  "claude-opus-5-5",
  "claude-fable-5-1",
  "claude-mythos-5-1",
  "claude-mythos-preview",
])("Claude %s cannot disable thinking", (model) => {
  expect(thinkingFields(build("Claude", model, "disabled"))).toEqual({
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
  });
  expect(thinkingFields(build("Claude", model, "auto"))).toEqual({});
});

test("Sonnet 5.5 turns off only up-front thinking", () => {
  expect(
    thinkingFields(
      build("Claude", "claude-sonnet-5-5", "disabled", {
        thinkingEffort: "max",
      })
    )
  ).toEqual({ thinking: { type: "between_tools" } });
});

test.each([
  ["gemini-4-argon", "low"],
  ["gemini-3.8-flash", "low"],
  ["gemini-3.6-flash", "minimal"],
  ["gemini-3.5-flash-lite", "minimal"],
  ["gemini-3.1-pro-preview", "low"],
  ["gemini-3-pro-preview", "low"],
  ["gemini-3-flash-preview", "minimal"],
])("Gemini %s uses its minimum level across protocols", (model, effort) => {
  expect(
    build("Gemini", model, "disabled").generation_config.thinking_level
  ).toBe(effort);
  expect(
    build("Gemini", model, "disabled", { url: GEMINI_GENERATE_CONTENT_URL })
      .generationConfig.thinkingConfig.thinkingLevel
  ).toBe(effort);
  expect(build("Gemini2", model, "disabled").reasoning_effort).toBe(effort);
  expect(build("Gemini", model, "auto").generation_config).not.toHaveProperty(
    "thinking_level"
  );
  expect(build("Gemini2", model, "auto")).not.toHaveProperty(
    "reasoning_effort"
  );
});

test.each([
  "DeepSeek",
  "OpenCodeGo",
  "XiaomiMimo",
  "Zai",
  "AliyunBailian",
  "SiliconFlow",
  "Cerebras",
  "Ollama",
  "OpenAI",
  "Claude",
  "OrcaRouter",
  "Requesty",
])(
  "%s does not inject controls for unknown models or stale saved efforts",
  (apiType) => {
    for (const mode of ["enabled", "disabled", "auto"])
      expect(
        thinkingFields(
          build(apiType, "unknown-model", mode, { thinkingEffort: "high" })
        )
      ).toEqual({});
  }
);

test("new presets use lightweight defaults while loading saved models never replaces them", () => {
  const defaults = {
    DeepSeek: "deepseek-flash",
    OpenCodeGo: "deepseek-v4.1-flash",
    SiliconFlow: "Qwen/Qwen3.6-35B-A3B",
    XiaomiMimo: "mimo-v2.6-flash",
    AliyunBailian: "qwen3.8-flash",
    Zai: "glm-5.3-flash",
    OpenAI: "gpt-6-luna",
    Gemini: "gemini-3.8-flash",
    Gemini2: "gemini-3.8-flash",
    Claude: "claude-haiku-5-5",
    OpenRouter: "openai/gpt-6-luna",
    OrcaRouter: "openai/gpt-6-luna",
    Requesty: "openai/gpt-6-luna",
    Ollama: "qwen3.5:4b",
  };
  for (const [apiType, model] of Object.entries(defaults)) {
    expect(createBuiltinInstance(apiType, "new", "New").model).toBe(model);
    const saved = {
      apiType,
      apiSlug: "saved",
      apiName: "Saved",
      model: "my-saved-model",
      url: "https://saved.test",
      thinkingMode: "disabled",
    };
    const loaded = normalizeApiThinkingSettings([
      withBuiltinProvider(saved),
    ])[0];
    expect(loaded).toMatchObject(saved);
  }
});
