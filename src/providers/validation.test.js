import { validateInput, validateResult, validateEvent } from "./validation";

const audio = { assetId: "asset-1", mimeType: "audio/wav" };
const image = { assetId: "asset-2", mimeType: "image/png" };
const question = {
  type: "choice",
  instructions: "Choose",
  criteria: ["yes", "no"],
};
const samples = {
  translate: [
    { items: [{ id: "a", text: "A" }], targetLanguage: "zh" },
    { items: [{ id: "a", text: "甲" }] },
  ],
  chat: [
    {
      messages: [{ role: "user", content: [{ type: "image", asset: image }] }],
    },
    { text: "image", reasoning: "" },
  ],
  summarize: [{ text: "body" }, { text: "summary" }],
  detectLanguage: [{ text: "hello" }, { language: "en", confidence: 0.9 }],
  dictionary: [{ text: "word" }, { text: "definition", format: "markdown" }],
  suggest: [{ text: "hel" }, { items: ["hello"] }],
  segmentSubtitle: [
    { items: [{ id: "cue", text: "hello", start: 0, end: 1 }] },
    { groups: [{ ids: ["cue"], text: "hello" }] },
  ],
  transcribe: [
    { audio },
    { text: "speech", segments: [{ text: "speech", start: 0, end: 1 }] },
  ],
  recognizeText: [
    { image },
    {
      text: "text",
      format: "text",
      items: [
        {
          text: "text",
          poly: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      ],
    },
  ],
  analyzeLayout: [
    { image },
    {
      regions: [
        {
          type: "text",
          order: 0,
          poly: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        },
      ],
    },
  ],
  evaluate: [
    { state: "test", questions: { q: question } },
    {
      model: "laya-rl-agent",
      answers: {
        q: {
          type: "choice",
          choice: "yes",
          confidence: 0.9,
          action: { act_probability: 1 },
        },
      },
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  ],
  synthesizeSpeech: [
    { text: "hello", voice: "alloy" },
    { audio, mimeType: audio.mimeType },
  ],
  speak: [{ text: "hello" }, { status: "ended" }],
};

test("video ASR requires real timestamps while existing text transcription remains valid", () => {
  expect(() =>
    validateInput("transcribe", { audio, requireTimestamps: "true" })
  ).toThrow();
  const input = { audio, requireTimestamps: true };
  expect(() => validateResult("transcribe", { text: "hello" }, input)).toThrow(
    "timestamps"
  );
  expect(() =>
    validateResult("transcribe", { text: "hello", segments: [] }, input)
  ).toThrow("timestamps");
  expect(() =>
    validateResult(
      "transcribe",
      {
        text: "hello",
        segments: [{ text: "hello", start: 0, end: 0 }],
      },
      input
    )
  ).toThrow("timestamps");
  expect(
    validateResult("transcribe", { text: "", segments: [] }, input)
  ).toEqual({ text: "", segments: [] });
  expect(validateResult("transcribe", { text: "hello" }, { audio })).toEqual({
    text: "hello",
  });
});

test.each(Object.entries(samples))(
  "%s validates a concrete input and result, rejecting missing inputs/results",
  (capability, [input, result]) => {
    expect(() => validateInput(capability, input)).not.toThrow();
    expect(validateResult(capability, result, input)).toBe(result);
    expect(() => validateInput(capability, {})).toThrow();
    expect(() => validateResult(capability, {}, input)).toThrow();
  }
);

test("malformed IDs, reversed times and falsely declared geometry are rejected", () => {
  const [input] = samples.translate;
  expect(() =>
    validateResult("translate", { items: [{ id: "other", text: "x" }] }, input)
  ).toThrow("IDs");
  expect(() =>
    validateInput("segmentSubtitle", {
      items: [{ id: "0", text: "x", start: 2, end: 1 }],
    })
  ).toThrow("times");
  expect(() =>
    validateResult(
      "recognizeText",
      { text: "x", format: "text" },
      samples.recognizeText[0],
      { coordinates: true }
    )
  ).toThrow("coordinates");
  expect(() =>
    validateResult("transcribe", { text: "x" }, samples.transcribe[0], {
      timestamps: true,
    })
  ).toThrow("timestamps");
});

test("event IDs cannot refer to another item or capability", () => {
  const [input] = samples.translate;
  expect(() =>
    validateEvent(
      "translate",
      { type: "item.delta", id: "a", text: "x" },
      input
    )
  ).not.toThrow();
  expect(() =>
    validateEvent(
      "translate",
      { type: "item.delta", id: "other", text: "x" },
      input
    )
  ).toThrow();
  expect(() =>
    validateEvent(
      "chat",
      { type: "item.complete", id: "a", text: "x" },
      samples.chat[0]
    )
  ).toThrow();
  expect(() =>
    validateEvent("chat", { type: "progress", progress: 2 }, {})
  ).toThrow();
});

test("VLM image tasks validate modes and coordinates independently from the model type", () => {
  const input = {
    image: { assetId: "asset-1", mimeType: "image/png" },
    mode: "table",
  };
  expect(() => validateInput("parseImage", input)).not.toThrow();
  expect(() =>
    validateInput("parseImage", { ...input, mode: "unknown" })
  ).toThrow("mode");
  expect(() =>
    validateResult("parseImage", { text: "table", format: "markdown" }, input)
  ).not.toThrow();
  expect(() =>
    validateResult("parseImage", { text: "table", format: "markdown" }, input, {
      coordinates: true,
    })
  ).toThrow("coordinates");
  expect(() =>
    validateResult(
      "parseImage",
      {
        text: "table",
        format: "markdown",
        items: [
          {
            text: "table",
            poly: [
              [0, 0],
              [1, 1],
              [2, 2],
            ],
          },
        ],
      },
      input
    )
  ).toThrow("blocks");
});

test("optional timestamps use actual response even when the provider declares them", () => {
  const input = { audio, requireTimestamps: false };
  expect(
    validateResult("transcribe", { text: "hello" }, input, { timestamps: true })
  ).toEqual({ text: "hello" });
  expect(() =>
    validateResult(
      "transcribe",
      { text: "hello", segments: [{ start: 2, end: 1, text: "hello" }] },
      input,
      { timestamps: true }
    )
  ).toThrow();
});
