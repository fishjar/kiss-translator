import { createTestInput, structuredTestSamples } from "./testInput";
import { PROVIDER_CAPABILITIES } from "./capabilities";
import { validateInput } from "./validation";

test.each(PROVIDER_CAPABILITIES)(
  "%s test form creates a valid production input",
  (capability) => {
    const store = {
      put: jest.fn(() => ({ assetId: "asset-1", mimeType: "test/data" })),
    };
    const text = structuredTestSamples[capability]
      ? JSON.stringify(structuredTestSamples[capability])
      : "hello";
    const input = createTestInput(capability, text, {}, store);
    expect(() => validateInput(capability, input)).not.toThrow();
    if (["transcribe", "recognizeText", "parseImage", "analyzeLayout"].includes(capability))
      expect(store.put).toHaveBeenCalledTimes(1);
  }
);
