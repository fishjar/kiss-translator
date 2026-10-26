import { packageDefinitions, summarizePackageNetwork } from "./packageNetwork";
import manifest from "../../docs/plugins/examples/openai-compatible-bundle/manifest.json";

test("package network details use effective service snapshots without credentials", () => {
  const definitions = packageDefinitions({
    manifest,
    implementations: Object.fromEntries(
      manifest.services.map((service) => [
        service.id,
        "exports.chat = () => ({text: 'ok'})",
      ])
    ),
  });
  const summary = summarizePackageNetwork(definitions);
  expect(summary.origins).toEqual(["https://api.openai.com"]);
  expect(summary.endpointFields).toEqual(["API 基础地址（包含 /v1）"]);
  expect(summary.endpointFieldI18n[summary.endpointFields[0]].en).toBe(
    "API base URL (including /v1)"
  );
  expect(summary.services).toHaveLength(manifest.services.length);
  expect(JSON.stringify(summary)).not.toContain("apiKey");
});

test("network summary includes every effective service scope and deduplicates shared addresses", () => {
  const summary = summarizePackageNetwork([
    {
      provider: {
        id: "one",
        permissions: {
          network: ["https://one.invalid"],
          endpointFields: ["endpoint"],
        },
        settings: [{ key: "endpoint", label: "API URL" }],
        capabilities: { chat: {} },
      },
    },
    {
      provider: {
        id: "two",
        permissions: {
          network: ["https://one.invalid", "https://two.invalid"],
        },
        capabilities: { translate: {} },
      },
    },
  ]);
  expect(summary.origins).toEqual([
    "https://one.invalid",
    "https://two.invalid",
  ]);
  expect(summary.endpointFields).toEqual(["API URL"]);
  expect(summary.services.map((service) => service.id)).toEqual(["one", "two"]);
});
