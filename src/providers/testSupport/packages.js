// Synthetic SDK integration packages. No official plugin sources or release data.
import { zipSync, strToU8 } from "fflate";
import { readProviderPackage } from "../package";
import { TRANSLATION_PROTOCOL_PROMPTS } from "../sdk/translation";

const auth = { type: "bearer", secret: { $secret: "apiKey" } };
const ref = (key) => ({ $ref: key });
const model = (value) => ({
  key: "model",
  type: "text",
  defaultValue: value,
});

export const testManifest = {
  apiVersion: 1,
  id: "test-sdk",
  name: "测试插件",
  nameI18n: { en: "Test plugin" },
  version: "1.0.0",
  permissions: {
    network: ["https://example.invalid"],
    endpointFields: ["baseUrl"],
  },
  sharedSettings: [
    {
      key: "baseUrl",
      type: "text",
      label: "接口地址",
      labelI18n: { en: "API URL" },
      defaultValue: "https://example.invalid/v1",
    },
    { key: "apiKey", type: "password", isSecret: true },
  ],
  services: [
    {
      id: "chat-completions",
      name: "测试聊天",
      nameI18n: { en: "Test chat" },
      implementation: { kind: "script", entry: "chat.js" },
      capabilities: {
        chat: { handler: "chat", outputModes: ["complete", "stream"] },
        translate: {
          handler: "translate",
          batch: { supported: true },
          outputModes: ["complete", "stream"],
        },
      },
      settings: [
        model("test-model"),
        {
          key: "thinkingMode",
          type: "select",
          defaultValue: "disabled",
          options: ["auto", "enabled", "disabled"].map((value) => ({
            label: value,
            value,
          })),
        },
        { key: "thinkingEffort", type: "text", defaultValue: "_default" },
        { key: "translationTemperature", type: "number", defaultValue: 0 },
      ],
      defaultPrompts: {
        batch: { ...TRANSLATION_PROTOCOL_PROMPTS.json, protocol: "json" },
        nobatch: { ...TRANSLATION_PROTOCOL_PROMPTS.text, protocol: "text" },
      },
    },
    ...[false, true].map((timestamps) => ({
      id: timestamps ? "timestamped-transcriptions" : "transcriptions",
      implementation: {
        kind: "declarative",
        entry: timestamps ? "timestamps.json" : "transcribe.json",
      },
      capabilities: { transcribe: { handler: "transcribe", timestamps } },
      settings: [model("test-asr")],
    })),
    {
      id: "speech",
      implementation: { kind: "declarative", entry: "speech.json" },
      capabilities: { synthesizeSpeech: { handler: "synthesizeSpeech" } },
      settings: [
        model("test-speech"),
        { key: "voice", type: "text", defaultValue: "test-voice" },
      ],
    },
    {
      id: "vision",
      implementation: { kind: "script", entry: "vision.js" },
      capabilities: {
        parseImage: { handler: "parseImage", coordinates: false },
      },
      settings: [model("test-vision")],
    },
  ],
};

const chatScript = `
async function complete(messages, config, ctx, translationInput) {
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl, model: config.model, messages: messages,
    stream: Boolean(ctx.options && ctx.options.streaming),
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") }
  });
  if (!(ctx.options && ctx.options.streaming))
    return ctx.helpers.openai.chatCompletions.parseResponse(await ctx.http.request(request));
  var parser = ctx.helpers.openai.chatCompletions.createStreamParser();
  var translation = translationInput
    ? await ctx.helpers.translation.createStreamParser(translationInput) : null;
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type !== "sse") continue;
    for (var event of parser.push(frame.data)) {
      if (translation) {
        if (event.type === "text.delta")
          for (var item of translation.push(event.text)) await ctx.emit(item);
      } else await ctx.emit(event);
    }
  }
  var result = parser.finish();
  return translation ? translation.finish() : result;
}
exports.chat = (input, config, ctx) => complete(input.messages, config, ctx);
exports.translate = async function(input, config, ctx) {
  var result = await complete(ctx.helpers.translation.buildMessages(input), config, ctx, input);
  if (ctx.options && ctx.options.streaming) return result;
  return ctx.helpers.translation.parseResult(result.text, input);
};`;

const visionScript = `
exports.parseImage = async function(input, config, ctx) {
  var bytes = await ctx.assets.read(input.image);
  var url = "data:" + input.image.mimeType + ";base64," + ctx.helpers.encoding.bytesToBase64(bytes);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl, model: config.model,
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    messages: [{ role: "user", content: [
      { type: "text", text: input.prompt || "Read the text." },
      { type: "image_url", image_url: { url: url } }
    ] }]
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(await ctx.http.request(request));
  return { text: result.text, format: "text", items: [{ text: result.text, poly: null }] };
};`;

function transcriptionRules(timestamps) {
  return {
    format: "http",
    handlers: {
      transcribe: {
        request: {
          url: {
            $url: { base: "config.baseUrl", path: "audio/transcriptions" },
          },
          method: "POST",
          auth,
          bodyType: "multipart",
          responseType: "text",
          body: {
            file: { $asset: "input.audio" },
            model: ref("config.model"),
            response_format: timestamps ? "verbose_json" : "json",
            language: {
              $ref: "input.language",
              omitIfEmpty: true,
              omitValues: ["auto"],
              transform: "languages.toIso6391",
            },
            ...(timestamps && { "timestamp_granularities[]": "segment" }),
          },
        },
        response: {
          kind: "json",
          errorPath: "error.message",
          map: {
            text: ref("response.text"),
            ...(timestamps && { segments: ref("response.segments") }),
          },
        },
      },
    },
  };
}

const speechRules = {
  format: "http",
  handlers: {
    synthesizeSpeech: {
      request: {
        url: { $url: { base: "config.baseUrl", path: "audio/speech" } },
        method: "POST",
        auth,
        bodyType: "json",
        responseType: "asset",
        body: {
          model: ref("config.model"),
          voice: ref("config.voice"),
          input: ref("input.text"),
          speed: ref("input.speed"),
          response_format: "mp3",
        },
      },
      response: { kind: "asset" },
    },
  },
};

export function testPackage(kind = "script") {
  const manifest = JSON.parse(JSON.stringify(testManifest));
  const handlers = Object.fromEntries(
    ["chat", "translate"].map((task) => [
      task,
      {
        protocol: "openai-chat-completions",
        task,
        request: {
          baseUrl: ref("config.baseUrl"),
          model: ref("config.model"),
          auth,
          parameters: {
            thinking: {
              $if: { $ref: "config.thinkingMode", equals: "auto" },
              else: { type: ref("config.thinkingMode") },
            },
            reasoning_effort: {
              $if: { $ref: "config.thinkingMode", equals: "enabled" },
              then: { $ref: "config.thinkingEffort", omitValues: ["_default"] },
            },
            ...(task === "translate" && {
              temperature: {
                $if: { $ref: "config.thinkingMode", equals: "disabled" },
                then: ref("config.translationTemperature"),
              },
            }),
          },
        },
      },
    ])
  );
  if (kind === "declarative") {
    manifest.services = manifest.services.slice(0, 1);
    manifest.services[0].implementation = { kind, entry: "chat.json" };
  }
  const files = {
    "manifest.json": JSON.stringify(manifest),
    ...(kind === "declarative"
      ? { "chat.json": JSON.stringify({ format: "protocol", handlers }) }
      : {
          "chat.js": chatScript,
          "vision.js": visionScript,
          "transcribe.json": JSON.stringify(transcriptionRules(false)),
          "timestamps.json": JSON.stringify(transcriptionRules(true)),
          "speech.json": JSON.stringify(speechRules),
        }),
  };
  return readProviderPackage(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, strToU8(text)])
      )
    )
  );
}
