import {
  executeImageRecognition,
  executeItemsTranslation,
  executeImagePipeline,
} from "./pipelineCore";
import { executeFileTranslation } from "../libs/fileTranslationService";
import { prepareImage } from "../localAi/core/inputLimits";
import { createNativeRegistry } from "../builtin-plugins/runtime";
import { invokeBackgroundPlugin } from "../providers/backgroundInvocation";

jest.mock("../providers/backgroundInvocation", () => ({
  invokeBackgroundPlugin: jest.fn(() => ({
    result: Promise.resolve({ text: "Plugin recognized text" }),
    events: {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: true }),
      }),
    },
    cancel: jest.fn(),
  })),
}));

jest.mock("../providers/transport", () => ({
  createAssetStore: () => ({
    put: jest.fn(() => "asset-key"),
    clear: jest.fn(),
  }),
}));

jest.mock("./resultCache", () => ({
  cachedFileResult: async ({ run, validate }) => {
    const result = await run();
    validate?.(result);
    return result;
  },
}));

jest.mock("../localAi/core/inputLimits", () => ({
  prepareImage: jest.fn(async (blob) => ({
    blob,
    size: { width: 400, height: 300 },
    original: { width: 400, height: 300 },
  })),
}));

jest.mock("../builtin-plugins/runtime", () => ({
  createNativeRegistry: jest.fn(() => ({
    invoke: jest.fn((apiSlug, capability) => ({
      result:
        apiSlug === "failing-vlm"
          ? Promise.reject(new Error("VLM service failed"))
          : apiSlug === "failing-layout"
            ? Promise.reject(new Error("Layout model crashed"))
            : Promise.resolve(
                capability === "analyzeLayout"
                  ? {
                      regions: [
                        {
                          type: "paragraph",
                          order: 0,
                          poly: [
                            [0, 0],
                            [400, 0],
                            [400, 300],
                            [0, 300],
                          ],
                        },
                      ],
                    }
                  : capability === "parseImage"
                    ? {
                        text: "VLM recognized text in crop",
                      }
                    : {
                        text: "Hello world\nWelcome to image translation",
                        items: [
                          {
                            text: "Hello world",
                            poly: [
                              [10, 10],
                              [100, 10],
                              [100, 40],
                              [10, 40],
                            ],
                          },
                          {
                            text: "Welcome to image translation",
                            poly: [
                              [10, 60],
                              [300, 60],
                              [300, 90],
                              [10, 90],
                            ],
                          },
                        ],
                      }
              ),
      events: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ done: true }),
        }),
      },
      cancel: jest.fn(),
    })),
  })),
}));

jest.mock("../libs/fileTranslationService", () => ({
  executeFileTranslation: jest.fn(),
}));

const mockCreateNativeRegistry = createNativeRegistry.getMockImplementation();
const mockInvokeBackgroundPlugin =
  invokeBackgroundPlugin.getMockImplementation();

describe("pipelineCore", () => {
  beforeEach(() => {
    createNativeRegistry.mockImplementation(mockCreateNativeRegistry);
    invokeBackgroundPlugin.mockImplementation(mockInvokeBackgroundPlugin);
    prepareImage.mockImplementation(async (blob) => ({
      blob,
      size: { width: 400, height: 300 },
      original: { width: 400, height: 300 },
    }));
    executeFileTranslation.mockReset().mockImplementation(async (text) => ({
      text: `译:${text}`,
      serviceId: "mock-trans",
    }));

    global.createImageBitmap = jest.fn(async () => ({
      width: 400,
      height: 300,
      close: jest.fn(),
    }));

    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: jest.fn(),
    }));

    HTMLCanvasElement.prototype.toBlob = jest.fn(function (cb, type) {
      cb(new Blob(["cropped-bytes"], { type: type || "image/png" }));
    });
  });

  const mockSetting = {
    transApis: [
      {
        apiSlug: "mock-ocr",
        apiName: "Mock OCR",
        provider: {
          apiVersion: 1,
          capabilities: {
            recognizeText: {
              handler: "ocr",
              coordinates: true,
              outputModes: ["complete"],
            },
          },
          implementation: { kind: "native" },
        },
        enabledCapabilities: ["recognizeText"],
      },
      {
        apiSlug: "mock-layout",
        apiName: "Mock Layout",
        provider: {
          apiVersion: 1,
          capabilities: {
            analyzeLayout: {
              handler: "layout",
              coordinates: true,
              outputModes: ["complete"],
            },
          },
          implementation: { kind: "native" },
        },
        enabledCapabilities: ["analyzeLayout"],
      },
      {
        apiSlug: "mock-trans",
        apiName: "Mock Trans",
        provider: {
          apiVersion: 1,
          capabilities: {
            translate: { handler: "translate", outputModes: ["complete"] },
          },
          implementation: { kind: "native" },
        },
        enabledCapabilities: ["translate"],
      },
      {
        apiSlug: "mock-vlm",
        apiName: "Mock VLM",
        provider: {
          apiVersion: 1,
          capabilities: {
            parseImage: {
              handler: "vlm",
              coordinates: false,
              outputModes: ["complete"],
            },
          },
          implementation: { kind: "native" },
        },
        enabledCapabilities: ["parseImage"],
      },
      {
        apiSlug: "failing-layout",
        apiName: "Failing Layout",
        provider: {
          apiVersion: 1,
          capabilities: {
            analyzeLayout: {
              handler: "layout",
              coordinates: true,
              outputModes: ["complete"],
            },
          },
          implementation: { kind: "native" },
        },
        enabledCapabilities: ["analyzeLayout"],
      },
    ],
    prompts: [],
  };

  test("executeImageRecognition crops OCR input by layout if layoutApiSlug is set", async () => {
    const blob = new Blob(["fake-image"], { type: "image/png" });
    const progress = [];
    const result = await executeImageRecognition({
      imageBlob: blob,
      recognitionService: { apiSlug: "mock-ocr", capability: "recognizeText" },
      layoutApiSlug: "mock-layout",
      setting: mockSetting,
      onProgress: (p) => progress.push(p.stage),
    });

    expect(progress).toContain("layout");
    expect(progress).toContain("recognize");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].text).toContain("Hello world");
  });

  test("executeItemsTranslation translates items sequentially", async () => {
    const items = [{ text: "Item 1" }, { text: "Item 2" }];
    const progress = [];
    const translated = await executeItemsTranslation({
      items,
      scene: { apiSlug: "mock-trans", fromLang: "auto", toLang: "zh-CN" },
      setting: mockSetting,
      onProgress: (p) => progress.push(p.current),
    });

    expect(translated.length).toBe(2);
    expect(translated[0].translation).toBe("译:Item 1");
    expect(translated[1].translation).toBe("译:Item 2");
    expect(progress).toContain(2);
  });

  test("executeImagePipeline handles 'all' action to complete recognition and translation", async () => {
    const blob = new Blob(["fake-image"], { type: "image/png" });
    const result = await executeImagePipeline({
      imageBlob: blob,
      scene: {
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        layoutApiSlug: "",
        apiSlug: "mock-trans",
        fromLang: "auto",
        toLang: "zh-CN",
      },
      setting: mockSetting,
      action: "all",
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].original).toBeDefined();
    expect(result.items[0].translation).toContain("译:");
    expect(result.translatedText).toContain("译:");
  });

  test("executeImageRecognition throws error when layout analysis fails", async () => {
    const blob = new Blob(["fake-image"], { type: "image/png" });
    await expect(
      executeImageRecognition({
        imageBlob: blob,
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        layoutApiSlug: "failing-layout",
        setting: mockSetting,
      })
    ).rejects.toThrow("版面布局分析失败");
    expect(
      createNativeRegistry.mock.results.map(
        ({ value }) => value.invoke.mock.calls[0][1]
      )
    ).toEqual(["analyzeLayout"]);
  });

  test("executeImageRecognition crops regions for text-only VLM when layoutApiSlug is set", async () => {
    const blob = new Blob(["fake-image"], { type: "image/png" });
    const result = await executeImageRecognition({
      imageBlob: blob,
      recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
      layoutApiSlug: "mock-layout",
      setting: mockSetting,
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].text).toBe("VLM recognized text in crop");
    expect(result.items[0].poly).toEqual([
      [0, 0],
      [400, 0],
      [400, 300],
      [0, 300],
    ]);
  });

  test("prepares VLM crops with the normalized input policy using the real image preparation code", async () => {
    prepareImage.mockImplementation(
      jest.requireActual("../localAi/core/inputLimits").prepareImage
    );
    const blob = new Blob(["image"], { type: "image/png" });
    blob.arrayBuffer = async () => new ArrayBuffer(5);
    HTMLCanvasElement.prototype.toBlob.mockImplementation((callback) =>
      callback(blob)
    );
    const result = await executeImagePipeline({
      imageBlob: blob,
      selectedRegions: [
        {
          enabled: true,
          bbox: [0, 0, 400, 50],
          polygon: [
            [0, 0],
            [400, 0],
            [400, 50],
            [0, 50],
          ],
        },
      ],
      setting: mockSetting,
      scene: {
        recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
        apiSlug: "mock-trans",
      },
      signal: new AbortController().signal,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].original).toBe("VLM recognized text in crop");
    expect(result.items[0].translation).toContain(
      "VLM recognized text in crop"
    );
    expect(prepareImage).toHaveBeenLastCalledWith(
      blob,
      expect.objectContaining({ maxImageEdge: expect.any(Number) }),
      expect.anything()
    );
  });

  test("propagates crop failures instead of reporting empty VLM text", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    prepareImage
      .mockImplementationOnce(async (blob) => ({
        blob,
        size: { width: 400, height: 300 },
        original: { width: 400, height: 300 },
      }))
      .mockRejectedValue(new Error("VLM crop failed"));
    try {
      await expect(
        executeImageRecognition({
          imageBlob: new Blob(["image"]),
          setting: mockSetting,
          recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
          selectedRegions: [
            {
              enabled: true,
              bbox: [0, 0, 400, 50],
              polygon: [
                [0, 0],
                [400, 0],
                [400, 50],
                [0, 50],
              ],
            },
          ],
        })
      ).rejects.toThrow("VLM crop failed");
    } finally {
      warn.mockRestore();
    }
  });

  test("propagates VLM service failures from selected regions", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        executeImageRecognition({
          imageBlob: new Blob(["image"]),
          setting: {
            ...mockSetting,
            transApis: [
              ...mockSetting.transApis,
              {
                ...mockSetting.transApis.find(
                  (api) => api.apiSlug === "mock-vlm"
                ),
                apiSlug: "failing-vlm",
              },
            ],
          },
          recognitionService: {
            apiSlug: "failing-vlm",
            capability: "parseImage",
          },
          selectedRegions: [
            {
              enabled: true,
              bbox: [0, 0, 400, 50],
              polygon: [
                [0, 0],
                [400, 0],
                [400, 50],
                [0, 50],
              ],
            },
          ],
        })
      ).rejects.toThrow("VLM service failed");
    } finally {
      warn.mockRestore();
    }
  });

  test("preserves successful VLM regions when another crop fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.createImageBitmap.mockRejectedValueOnce(
      new Error("first crop failed")
    );
    try {
      const result = await executeImageRecognition({
        imageBlob: new Blob(["image"]),
        setting: mockSetting,
        recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
        selectedRegions: [
          {
            enabled: true,
            bbox: [0, 0, 400, 50],
            polygon: [
              [0, 0],
              [400, 0],
              [400, 50],
              [0, 50],
            ],
          },
          {
            enabled: true,
            bbox: [0, 50, 400, 100],
            polygon: [
              [0, 50],
              [400, 50],
              [400, 100],
              [0, 100],
            ],
          },
        ],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toBe("VLM recognized text in crop");
    } finally {
      warn.mockRestore();
    }
  });

  test("recognizes text-only VLM output without a layout service", async () => {
    const result = await executeImagePipeline({
      imageBlob: new Blob(["image"]),
      setting: mockSetting,
      scene: {
        recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
        apiSlug: "mock-trans",
      },
    });
    expect(result.items[0].original).toBe("VLM recognized text in crop");
    expect(result.items[0].translation).toContain(
      "VLM recognized text in crop"
    );
  });

  test("executeImagePipeline emits recognize_done progress when recognition finishes in 'all' action", async () => {
    const blob = new Blob(["fake-image"], { type: "image/png" });
    const progressStages = [];
    const result = await executeImagePipeline({
      imageBlob: blob,
      scene: {
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        layoutApiSlug: "",
        apiSlug: "mock-trans",
        fromLang: "auto",
        toLang: "zh-CN",
      },
      setting: mockSetting,
      action: "all",
      onProgress: (p) => {
        progressStages.push(p.stage);
      },
    });

    expect(progressStages).toContain("recognize_done");
    expect(result.items.length).toBeGreaterThan(0);
  });

  test.each(["mock-ocr", "mock-vlm"])(
    "reuses selected layout for %s without reanalysis or reselecting excluded regions",
    async (apiSlug) => {
      const selectedRegions = [
        {
          order: 0,
          enabled: true,
          bbox: [0, 0, 400, 50],
          polygon: [
            [0, 0],
            [400, 0],
            [400, 50],
            [0, 50],
          ],
        },
        {
          order: 1,
          enabled: false,
          bbox: [0, 50, 400, 300],
          polygon: [
            [0, 50],
            [400, 50],
            [400, 300],
            [0, 300],
          ],
        },
      ];
      const progress = [];
      const result = await executeImagePipeline({
        imageBlob: new Blob(["image"], { type: "image/png" }),
        setting: mockSetting,
        scene: {
          layoutApiSlug: "failing-layout",
          recognitionService: {
            apiSlug,
            capability: apiSlug === "mock-ocr" ? "recognizeText" : "parseImage",
          },
          apiSlug: "mock-trans",
        },
        selectedRegions,
        onProgress: (p) => progress.push(p),
      });
      expect(progress.some((p) => p.stage === "layout")).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(executeFileTranslation).toHaveBeenCalledTimes(1);
      expect(result.items[0].poly).toEqual(selectedRegions[0].polygon);
      expect(result.layout.regions).toEqual(selectedRegions);
      expect(
        progress.find((p) => p.stage === "recognize_done").layout.regions[1]
          .enabled
      ).toBe(false);
    }
  );

  test("an explicit empty selection translates no regions", async () => {
    const result = await executeImagePipeline({
      imageBlob: new Blob(["image"], { type: "image/png" }),
      setting: mockSetting,
      scene: {
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        apiSlug: "mock-trans",
      },
      selectedRegions: [],
    });
    expect(result.items).toEqual([]);
    expect(executeFileTranslation).not.toHaveBeenCalled();
  });

  test("recognize action does not invoke layout or translation when no layout exists", async () => {
    const result = await executeImagePipeline({
      imageBlob: new Blob(["image"], { type: "image/png" }),
      setting: mockSetting,
      scene: {
        layoutApiSlug: "failing-layout",
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
      },
      action: "recognize",
    });
    expect(result.items).toHaveLength(2);
    expect(executeFileTranslation).not.toHaveBeenCalled();
  });

  test("layout action ignores old selections and runs only analysis", async () => {
    const result = await executeImagePipeline({
      imageBlob: new Blob(["image"], { type: "image/png" }),
      setting: mockSetting,
      scene: { layoutApiSlug: "mock-layout" },
      action: "layout",
      selectedRegions: [],
    });
    expect(result.layout.regions).toHaveLength(1);
    expect(result.items).toBeUndefined();
    expect(executeFileTranslation).not.toHaveBeenCalled();
  });

  test("maps existing regions through image downscaling while keeping source coordinates", async () => {
    prepareImage.mockImplementationOnce(async (blob) => ({
      blob,
      size: { width: 400, height: 300 },
      original: { width: 800, height: 600 },
    }));
    const regions = [
      {
        enabled: true,
        bbox: [0, 0, 800, 100],
        polygon: [
          [0, 0],
          [800, 0],
          [800, 100],
          [0, 100],
        ],
      },
    ];
    const result = await executeImageRecognition({
      imageBlob: new Blob(["image"], { type: "image/png" }),
      setting: mockSetting,
      recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
      layoutApiSlug: "failing-layout",
      selectedRegions: regions,
    });
    expect(
      HTMLCanvasElement.prototype.getContext.mock.results[0].value.drawImage
    ).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 50, 0, 0, 400, 50);
    expect(result.items[0].poly).toEqual(regions[0].polygon);
    expect(result.layout.regions).toEqual(regions);
  });

  const region = (top, enabled = true) => ({
    enabled,
    type: "paragraph",
    order: top,
    bbox: [10, top, 210, top + 40],
    polygon: [
      [10, top],
      [210, top],
      [210, top + 40],
      [10, top + 40],
    ],
  });
  const providerCalls = () =>
    createNativeRegistry.mock.results.flatMap(
      ({ value }) => value.invoke.mock.calls
    );

  test.each([
    ["recognizeText", true],
    ["recognizeText", false],
    ["parseImage", true],
    ["parseImage", false],
  ])(
    "%s with coordinates=%s crops selected regions sequentially without requiring coordinates",
    async (capability, coordinates) => {
      const api = {
        apiSlug: "region-service",
        provider: {
          apiVersion: 1,
          implementation: { kind: "native" },
          capabilities: { [capability]: { coordinates } },
        },
      };
      const calls = [];
      let active = 0;
      let maxActive = 0;
      createNativeRegistry.mockImplementation(() => ({
        invoke: jest.fn((slug, cap, input) => {
          calls.push(input);
          active++;
          maxActive = Math.max(active, maxActive);
          return {
            result: Promise.resolve().then(() => {
              active--;
              // 故意不返回坐标，分区识别只需要文字。
              return {
                items: [{ text: "First line" }, { text: "Second line" }],
              };
            }),
            events: { async *[Symbol.asyncIterator]() {} },
            cancel: jest.fn(),
          };
        }),
      }));
      const selectedRegions = [region(10), region(60, false), region(110)];
      const result = await executeImagePipeline({
        imageBlob: new Blob(["source"]),
        setting: { ...mockSetting, transApis: [...mockSetting.transApis, api] },
        scene: {
          recognitionService: { apiSlug: api.apiSlug, capability },
          apiSlug: "mock-trans",
        },
        selectedRegions,
      });
      expect(calls).toHaveLength(2);
      expect(maxActive).toBe(1);
      expect(
        prepareImage.mock.calls.slice(1).map(([blob]) => blob)
      ).not.toContain(prepareImage.mock.calls[0][0]);
      expect(
        HTMLCanvasElement.prototype.getContext.mock.results.map(({ value }) =>
          value.drawImage.mock.calls[0].slice(1)
        )
      ).toEqual([
        [10, 10, 200, 40, 0, 0, 200, 40],
        [10, 110, 200, 40, 0, 0, 200, 40],
      ]);
      expect(result.items.map((item) => item.original)).toEqual([
        "First line\nSecond line",
        "First line\nSecond line",
      ]);
      expect(result.items.map((item) => item.poly)).toEqual([
        selectedRegions[0].polygon,
        selectedRegions[2].polygon,
      ]);
      expect(result.items.map((item) => item.order)).toEqual([10, 110]);
      expect(result.layout.regions).toEqual(selectedRegions);
      expect(executeFileTranslation).toHaveBeenCalledTimes(2);
    }
  );

  test.each([[], [region(10, false)]].map((regions) => [regions]))(
    "empty or fully disabled selections skip all providers: %j",
    async (selectedRegions) => {
      const result = await executeImagePipeline({
        imageBlob: new Blob(["source"]),
        setting: mockSetting,
        scene: {
          recognitionService: {
            apiSlug: "mock-ocr",
            capability: "recognizeText",
          },
          layoutApiSlug: "mock-layout",
          apiSlug: "mock-trans",
        },
        selectedRegions,
      });
      expect(providerCalls()).toEqual([]);
      expect(result.items).toEqual([]);
      expect(executeFileTranslation).not.toHaveBeenCalled();
    }
  );

  test.each([undefined, "missing-layout", "mock-trans", "disabled-layout"])(
    "unavailable layout %s recognizes the whole image once",
    async (layoutApiSlug) => {
      const result = await executeImageRecognition({
        imageBlob: new Blob(["source"]),
        setting: {
          ...mockSetting,
          transApis: [
            ...mockSetting.transApis,
            {
              ...mockSetting.transApis[1],
              apiSlug: "disabled-layout",
              isDisabled: true,
            },
          ],
        },
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        layoutApiSlug,
      });
      expect(providerCalls()).toHaveLength(1);
      expect(prepareImage).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(2);
    }
  );

  test.each(
    [
      [],
      [{ poly: [] }],
      [
        {
          poly: [
            [-100, -100],
            [-50, -100],
            [-50, -50],
          ],
        },
      ],
    ].map((regions) => [regions])
  )(
    "empty or invalid analyzed layout falls back to whole image: %j",
    async (regions) => {
      const registry = mockCreateNativeRegistry();
      const invoke = registry.invoke;
      createNativeRegistry.mockReturnValueOnce({
        ...registry,
        invoke: jest.fn(() => ({
          result: Promise.resolve({ regions }),
          events: { async *[Symbol.asyncIterator]() {} },
          cancel: jest.fn(),
        })),
      });
      const result = await executeImageRecognition({
        imageBlob: new Blob(["source"]),
        setting: mockSetting,
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        layoutApiSlug: "mock-layout",
      });
      expect(providerCalls()).toHaveLength(2);
      expect(invoke).not.toHaveBeenCalled();
      expect(prepareImage).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(2);
    }
  );

  test.each([
    ["all", 1],
    ["all", 2],
    ["recognize", 1],
  ])("cancellation stops %s with %s regions", async (action, count) => {
    const controller = new AbortController();
    createNativeRegistry.mockImplementation(() => ({
      invoke: jest.fn(() => ({
        result: Promise.resolve().then(() => {
          controller.abort();
          return { text: "done" };
        }),
        events: { async *[Symbol.asyncIterator]() {} },
        cancel: jest.fn(),
      })),
    }));
    await expect(
      executeImagePipeline({
        imageBlob: new Blob(["source"]),
        setting: mockSetting,
        scene: {
          recognitionService: {
            apiSlug: "mock-ocr",
            capability: "recognizeText",
          },
          apiSlug: "mock-trans",
        },
        action,
        selectedRegions: [region(10), region(110)].slice(0, count),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(providerCalls()).toHaveLength(1);
    expect(executeFileTranslation).not.toHaveBeenCalled();
  });

  test("skips invalid ranges and clamps a valid crop to image bounds", async () => {
    const result = await executeImageRecognition({
      imageBlob: new Blob(["source"]),
      setting: mockSetting,
      recognitionService: { apiSlug: "mock-ocr", capability: "recognizeText" },
      selectedRegions: [
        { ...region(10), bbox: [NaN, 10, 210, 50] },
        { ...region(10), bbox: [10, 10, 10, 50] },
        { ...region(10), bbox: [-10, 10, 500, 50] },
      ],
    });
    expect(providerCalls()).toHaveLength(1);
    expect(
      HTMLCanvasElement.prototype.getContext.mock.results[0].value.drawImage
    ).toHaveBeenCalledWith(expect.anything(), 0, 10, 400, 40, 0, 0, 400, 40);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe(
      "Hello world\nWelcome to image translation"
    );
  });

  test("invalid selected ranges fall back to whole-image recognition and retain its text", async () => {
    const result = await executeImagePipeline({
      imageBlob: new Blob(["source"]),
      setting: mockSetting,
      scene: {
        recognitionService: {
          apiSlug: "mock-ocr",
          capability: "recognizeText",
        },
        apiSlug: "mock-trans",
      },
      selectedRegions: [{ ...region(10), bbox: [0, 0, 0, 0] }],
    });
    expect(providerCalls()).toHaveLength(1);
    expect(prepareImage).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(2);
    expect(executeFileTranslation).toHaveBeenCalledTimes(2);
  });

  test("publishes layout before inference and original text before the next region completes", async () => {
    let finishFirst;
    let finishSecond;
    let startFirst;
    let startSecond;
    const firstStarted = new Promise((resolve) => {
      startFirst = resolve;
    });
    const secondStarted = new Promise((resolve) => {
      startSecond = resolve;
    });
    const first = new Promise((resolve) => {
      finishFirst = resolve;
    });
    const second = new Promise((resolve) => {
      finishSecond = resolve;
    });
    let index = 0;
    createNativeRegistry.mockImplementation(() => ({
      invoke: jest.fn(() => {
        const next = index++;
        (next === 0 ? startFirst : startSecond)();
        return {
          result: next === 0 ? first : second,
          events: { async *[Symbol.asyncIterator]() {} },
          cancel: jest.fn(),
        };
      }),
    }));
    const selectedRegions = [region(10), region(60, false), region(110)];
    const progress = [];
    const running = executeImagePipeline({
      imageBlob: new Blob(["source"]),
      setting: mockSetting,
      scene: {
        recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
        apiSlug: "mock-trans",
      },
      selectedRegions,
      onProgress: (p) => progress.push(p),
    });
    await firstStarted;
    expect(progress[0]).toMatchObject({
      stage: "recognize",
      current: 0,
      total: 2,
      items: [],
      layout: { regions: selectedRegions },
    });
    finishFirst({ text: "First original" });
    await secondStarted;
    expect(progress.at(-1)).toMatchObject({
      stage: "recognize",
      current: 1,
      total: 2,
      items: [{ original: "First original", translation: "" }],
    });
    expect(executeFileTranslation).not.toHaveBeenCalled();
    finishSecond({ text: "Second original" });
    const result = await running;
    expect(
      progress.filter((p) => p.stage === "recognize").map((p) => p.current)
    ).toEqual([0, 1, 2]);
    expect(progress[0].items).toEqual([]);
    expect(progress[1].items).toHaveLength(1);
    expect(result.items.map((item) => item.original)).toEqual([
      "First original",
      "Second original",
    ]);
  });

  test("newly analyzed layout is in original coordinates before the first recognition call", async () => {
    prepareImage.mockImplementationOnce(async (blob) => ({
      blob,
      size: { width: 400, height: 300 },
      original: { width: 800, height: 600 },
    }));
    const registry = mockCreateNativeRegistry();
    const invoke = registry.invoke;
    let layoutAtInference;
    const progress = [];
    createNativeRegistry.mockImplementation(() => ({
      invoke: jest.fn((...args) => {
        if (args[1] !== "analyzeLayout")
          layoutAtInference = progress.find((p) => p.layout);
        return invoke(...args);
      }),
    }));
    await executeImageRecognition({
      imageBlob: new Blob(["source"]),
      setting: mockSetting,
      recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
      layoutApiSlug: "mock-layout",
      onProgress: (p) => progress.push(p),
    });
    expect(layoutAtInference).toMatchObject({
      current: 0,
      total: 1,
      layout: {
        imageSize: { width: 800, height: 600 },
        regions: [{ bbox: [0, 0, 800, 600] }],
      },
    });
  });

  test("a failed region advances recognition progress without discarding successful originals", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.createImageBitmap.mockRejectedValueOnce(new Error("bad crop"));
    const progress = [];
    try {
      await executeImageRecognition({
        imageBlob: new Blob(["source"]),
        setting: mockSetting,
        recognitionService: { apiSlug: "mock-vlm", capability: "parseImage" },
        selectedRegions: [region(10), region(110)],
        onProgress: (p) => progress.push(p),
      });
      expect(
        progress
          .filter((p) => p.stage === "recognize")
          .map((p) => [p.current, p.items.length])
      ).toEqual([
        [0, 0],
        [1, 0],
        [2, 1],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test.each([
    ["LocalAI", "", "", undefined],
    ["LocalAI", "service-prompt", "", "service prompt"],
    ["LocalAI", "service-prompt", "scene-prompt", "scene prompt"],
    ["OpenAI", "", "", expect.any(String)],
    ["Plugin", "", "", undefined, "script"],
    ["Plugin", "", "", undefined, "declarative"],
    ["Plugin", "service-prompt", "", "service prompt", "script"],
    ["Plugin", "service-prompt", "scene-prompt", "scene prompt", "script"],
  ])(
    "%s VLM resolves service prompt %s and scene prompt %s",
    async (apiType, serviceSlug, sceneSlug, expected, kind = "native") => {
      const api = {
        ...mockSetting.transApis.find((a) => a.apiSlug === "mock-vlm"),
        apiType,
        modelRef: "paddleocr-vl-1.6-onnx-q8",
        vlmPromptSlug: serviceSlug,
      };
      api.provider = {
        ...api.provider,
        implementation: { kind },
        defaultPrompts: { vlm: { userPrompt: "Free OCR." } },
      };
      invokeBackgroundPlugin.mockClear();
      await executeImageRecognition({
        imageBlob: new Blob(["source"]),
        setting: {
          transApis: [api],
          prompts: [
            {
              slug: "service-prompt",
              category: "vlm prompt",
              userPrompt: "service prompt",
            },
            {
              slug: "scene-prompt",
              category: "vlm prompt",
              userPrompt: "scene prompt",
            },
          ],
        },
        recognitionService: { apiSlug: api.apiSlug, capability: "parseImage" },
        vlmPromptSlug: sceneSlug,
        selectedRegions: [region(10)],
      });
      const calls =
        kind === "native" ? providerCalls() : invokeBackgroundPlugin.mock.calls;
      expect(calls[0][2].prompt).toEqual(expected);
    }
  );

  test.each(["all", "recognize"])(
    "%s reports the two failed regions alongside the two recognized originals",
    async (action) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      let index = 0;
      createNativeRegistry.mockImplementation(() => ({
        invoke: jest.fn(() => {
          const next = index++;
          return {
            result:
              next === 2
                ? Promise.reject(new Error("Offscreen RPC request timed out"))
                : Promise.resolve({
                    text: next === 3 ? "" : `Original ${next + 1}`,
                  }),
            events: { async *[Symbol.asyncIterator]() {} },
            cancel: jest.fn(),
          };
        }),
      }));
      const progress = [];
      const selectedRegions = [10, 60, 110, 160].map((top, order) => ({
        ...region(top),
        order,
      }));
      try {
        const result = await executeImagePipeline({
          imageBlob: new Blob(["source"]),
          setting: mockSetting,
          action,
          scene: {
            recognitionService: {
              apiSlug: "mock-vlm",
              capability: "parseImage",
            },
            apiSlug: "mock-trans",
          },
          selectedRegions,
          onProgress: (p) => progress.push(p),
        });
        expect(result.items.map((item) => item.original)).toEqual([
          "Original 1",
          "Original 2",
        ]);
        expect(result.recognitionErrors).toEqual([
          { order: 2, error: "Offscreen RPC request timed out" },
          { order: 3, error: expect.stringContaining("识别返回空结果") },
        ]);
        expect(result.layout.regions).toHaveLength(4);
        expect(
          progress.filter((p) => p.stage === "recognize").at(-1)
        ).toMatchObject({
          current: 4,
          total: 4,
          recognitionErrors: result.recognitionErrors,
        });
        expect(executeFileTranslation).toHaveBeenCalledTimes(
          action === "all" ? 2 : 0
        );
      } finally {
        warn.mockRestore();
      }
    }
  );
});
