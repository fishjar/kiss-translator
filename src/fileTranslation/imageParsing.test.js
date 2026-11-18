import { buildImageParseInput, mapImageResult } from "./imageParsing";
import { resolveTerminology } from "../libs/terminologyStorage";

jest.mock("../libs/terminologyStorage", () => ({
  resolveTerminology: jest.fn(async () => ({ glossary: { door: "门扉" } })),
}));

beforeEach(() =>
  resolveTerminology.mockResolvedValue({ glossary: { door: "门扉" } })
);

const api = {
  apiSlug: "vision",
  apiType: "Plugin",
  provider: {
    implementation: { kind: "script" },
    source: { pluginId: "test", serviceId: "vision" },
    defaultPrompts: {
      vlm: [
        {
          id: "default",
          protocol: "image-json",
          userPrompt: "Translate into {{to}}",
        },
      ],
    },
  },
};

test("the default plugin prompt supplies its protocol and task snapshot", async () => {
  const result = await buildImageParseInput({
    api,
    capability: "parseImage",
    setting: { prompts: [] },
    scene: { fromLang: "auto", toLang: "zh-CN" },
  });
  expect(result).toMatchObject({
    protocol: "image-json",
    sourceLanguage: "auto",
    targetLanguage: "zh-CN",
    glossary: { door: "门扉" },
  });
});

test.each(["table", "formula"])(
  "%s never inherits the document translation protocol",
  async (mode) => {
    resolveTerminology.mockClear();
    const result = await buildImageParseInput({
      api,
      capability: "parseImage",
      mode,
      setting: { prompts: [] },
      promptSlug: "document-translation",
      scene: { toLang: "zh-CN" },
    });
    expect(result.protocol).toBeUndefined();
    expect(result.targetLanguage).toBeUndefined();
    expect(resolveTerminology).not.toHaveBeenCalled();
  }
);

test("layout coordinates are restored independently of text coordinates", () => {
  const result = mapImageResult(
    {
      format: "text",
      layout: {
        regions: [
          {
            id: "r",
            type: "paragraph",
            order: 0,
            text: "Hello",
            translation: "你好",
            poly: [
              [0, 0],
              [50, 0],
              [50, 20],
              [0, 20],
            ],
          },
        ],
      },
    },
    { original: { width: 200, height: 100 }, size: { width: 100, height: 50 } },
    { protocol: "image-json", targetLanguage: "zh-CN" }
  );
  expect(result.items[0]).toMatchObject({
    id: "r",
    translation: "你好",
    poly: null,
    regionPoly: [
      [0, 0],
      [100, 0],
      [100, 40],
      [0, 40],
    ],
  });
  expect(result.layout.regions[0].poly).toEqual(result.items[0].regionPoly);
});
