import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { providerCacheSignature } from "./cache";
import { instanceTestSignature } from "./upgrade";

const originalCrypto = global.crypto;
const originalEncoder = global.TextEncoder;
beforeAll(() => {
  global.crypto = webcrypto;
  global.TextEncoder = TextEncoder;
});
afterAll(() => {
  global.crypto = originalCrypto;
  global.TextEncoder = originalEncoder;
});
const api = {
  apiSlug: "instance",
  apiName: "Name",
  key: "private-key",
  url: "https://example.invalid",
  provider: { code: "implementation", apiVersion: "1" },
  pluginConfig: { model: "model-a" },
  temperature: 0.2,
};

test("configuration, capability, implementation and full document context independently invalidate cached results", async () => {
  const context = {
    glossary: { term: "translation" },
    docInfo: { summary: "x".repeat(50) + "first" },
    textFormat: "html",
  };
  const signature = await providerCacheSignature(api, "translate", context);
  expect(signature).toMatch(/^[a-f0-9]{64}$/);
  for (const changed of [
    { ...api, pluginConfig: { model: "model-b" } },
    { ...api, temperature: 0.5 },
    { ...api, key: "other-key" },
    { ...api, provider: { ...api.provider, code: "new implementation" } },
  ])
    expect(
      await providerCacheSignature(changed, "translate", context)
    ).not.toBe(signature);
  expect(await providerCacheSignature(api, "dictionary", context)).not.toBe(
    signature
  );
  expect(
    await providerCacheSignature(api, "translate", {
      ...context,
      docInfo: { summary: "x".repeat(50) + "second" },
    })
  ).not.toBe(signature);
  expect(
    await providerCacheSignature(
      { ...api, apiName: "Renamed", sortOrder: 5, isDisabled: true },
      "translate",
      context
    )
  ).toBe(signature);
  expect(signature).not.toContain("private-key");
});

test("streaming transport choice invalidates cache and test evidence", async () => {
  const candidate = {
    ...api,
    enabledCapabilities: ["translate"],
    provider: {
      ...api.provider,
      capabilities: {
        translate: {
          handler: "translate",
          outputModes: ["complete", "stream"],
        },
      },
    },
  };
  const automatic = await providerCacheSignature(candidate, "translate", {});
  expect(
    await providerCacheSignature(
      { ...candidate, useStream: false },
      "translate",
      {}
    )
  ).not.toBe(automatic);
  expect(instanceTestSignature({ ...candidate, useStream: false })).not.toBe(
    instanceTestSignature(candidate)
  );
});
