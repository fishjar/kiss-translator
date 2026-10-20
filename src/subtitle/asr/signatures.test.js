import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { asrCacheSignatures } from "./signatures";

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const encoder = globalThis.TextEncoder;
beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
  globalThis.TextEncoder = TextEncoder;
});
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  else delete globalThis.crypto;
  globalThis.TextEncoder = encoder;
});
const service = {
  apiType: "Plugin",
  url: "https://example.invalid/asr?token=secret",
  model: "whisper-1",
  key: "secret",
  provider: {
    settings: [
      { key: "apiKey", type: "password" },
      { key: "model", type: "text" },
    ],
  },
  pluginConfig: { apiKey: "secret", model: "whisper-1" },
};
test("credentials and timeouts do not invalidate completed subtitles", async () => {
  const original = await asrCacheSignatures({
    asrService: service,
    language: "en",
  });
  const changed = await asrCacheSignatures({
    asrService: {
      ...service,
      key: "changed",
      httpTimeout: 12,
      url: "https://example.invalid/asr?token=changed",
      pluginConfig: { ...service.pluginConfig, apiKey: "changed" },
    },
    language: "en",
  });
  expect(changed).toEqual(original);
  expect(JSON.stringify(changed)).not.toContain("secret");
});
test("recognition, segmentation and translation settings invalidate only their own layer", async () => {
  const base = {
    asrService: service,
    translationService: service,
    setting: { toLang: "zh" },
    language: "en",
  };
  const original = await asrCacheSignatures(base);
  expect(
    (await asrCacheSignatures({ ...base, setting: { toLang: "ja" } }))
      .recognition
  ).toBe(original.recognition);
  expect(
    (await asrCacheSignatures({ ...base, setting: { toLang: "ja" } }))
      .translation
  ).not.toBe(original.translation);
  expect(
    (
      await asrCacheSignatures({
        ...base,
        asrService: { ...service, model: "other" },
      })
    ).recognition
  ).not.toBe(original.recognition);
  expect(
    (
      await asrCacheSignatures({
        ...base,
        setting: { ...base.setting, useAlgorithmBreaker: "statistical" },
      })
    ).segmentation
  ).not.toBe(original.segmentation);
});


test("effective cutting limits invalidate recognition but not translation settings", async () => {
  const base = { asrService: { ...service, asrTimestampSupport: "supported" }, language: "en" };
  const original = await asrCacheSignatures(base);
  for (const change of [
    { asrService: { ...base.asrService, asrMaxDurationSeconds: 5 } },
    { limits: { maxModelDurationSeconds: 4 } },
    { limits: { maxBytes: 64044 } },
  ]) {
    const changed = await asrCacheSignatures({ ...base, ...change });
    expect(changed.recognition).not.toBe(original.recognition);
    expect(changed.segmentation).toBe(original.segmentation);
    expect(changed.translation).toBe(original.translation);
  }
});
