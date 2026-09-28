import { OPT_TRANS_BUILTINAI } from "./api";
import {
  availableApisForScene,
  normalizeApiCapabilities,
  orderedApiSlugs,
} from "./serviceSelection";

test("legacy singular selection becomes an ordered one-item list", () => {
  expect(orderedApiSlugs({ apiSlug: "first" })).toEqual(["first"]);
  expect(orderedApiSlugs({ apiSlug: "first", apiSlugs: ["second", "first"] })).toEqual([
    "second",
    "first",
  ]);
});

test("built-in AI is classified separately from network adapters", () => {
  expect(normalizeApiCapabilities({ apiType: OPT_TRANS_BUILTINAI }).sourceType).toBe(
    "builtin"
  );
  expect(normalizeApiCapabilities({ apiType: "Microsoft" }).sourceType).toBe(
    "network"
  );
});

test("unimplemented capabilities and absent local models cannot be selected", () => {
  const apis = [
    { apiSlug: "local", sourceType: "local", modelRef: "m", capabilities: ["translation"] },
    { apiSlug: "ocr", sourceType: "network", capabilities: ["ocr"] },
    { apiSlug: "network", sourceType: "network", capabilities: ["translation"] },
  ];
  expect(
    availableApisForScene({ apiSlugs: ["local", "ocr", "network"] }, apis, "translation")
      .map((api) => api.apiSlug)
  ).toEqual(["network"]);
});

test("normalizes vlm capability and preserves it in capabilities list", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "OpenAI",
    capabilities: ["translation", "ocr", "vlm", "invalid_cap"],
  });
  expect(normalized.capabilities).toEqual(["translation", "ocr", "vlm"]);
});
