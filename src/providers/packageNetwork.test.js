import { packageDefinitions, summarizePackageNetwork } from "./packageNetwork";
import { testManifest as manifest } from "./testSupport/packages";

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
  expect(summary.origins).toEqual(["https://example.invalid"]);
  expect(summary.endpointFields).toEqual(["接口地址"]);
  expect(summary.endpointFieldI18n[summary.endpointFields[0]].en).toBe(
    "API URL"
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

test("stored plugins requiring a newer host can still display network metadata", () => {
  const summary = summarizePackageNetwork(
    packageDefinitions({
      manifest: { ...manifest, apiVersion: 99 },
    })
  );
  expect(summary.origins).toEqual(["https://example.invalid"]);
  expect(summary.endpointFields).toEqual(["接口地址"]);
  expect(summary.services).toHaveLength(manifest.services.length);
});

test("Origin rewrite details are deduplicated across stored service snapshots", () => {
  const provider = {
    id: "vision",
    capabilities: { parseImage: {} },
    permissions: {
      network: ["https://a.example"],
      originRewrite: ["https://a.example"],
    },
  };
  const summary = summarizePackageNetwork([
    { provider },
    { provider: { ...provider, id: "translation" } },
  ]);
  expect(summary.originRewrite).toEqual(["https://a.example"]);
});
