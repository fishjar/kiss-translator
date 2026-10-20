import {
  groupImageTextByLayout,
  recognizeImageWithLayout,
} from "./imageLayout";

const poly = ([l, t, r, b]) => [
  [l, t],
  [r, t],
  [r, b],
  [l, b],
];
const line = (text, box) => ({ text, poly: poly(box) });
const region = (id, box, order) => ({
  id,
  bbox: box,
  polygon: poly(box),
  order,
});
const layout = {
  imageSize: { width: 100, height: 100 },
  regions: [
    region("second", [0, 50, 100, 80], 1),
    region("first", [0, 0, 100, 40], 0),
  ],
};

test("merges OCR lines into layout paragraphs in reading order and original image coordinates", () => {
  const result = groupImageTextByLayout(
    {
      imageSize: { width: 200, height: 200 },
      items: [
        line("paragraph two", [10, 105, 180, 120]),
        line("line two", [10, 35, 180, 50]),
        line("line one", [10, 10, 180, 25]),
      ],
    },
    layout
  );
  expect(result.items).toEqual([
    {
      text: "line one line two",
      poly: poly([0, 0, 200, 80]),
      box: [0, 0, 200, 80],
    },
    {
      text: "paragraph two",
      poly: poly([0, 100, 200, 160]),
      box: [0, 100, 200, 160],
    },
  ]);
});

test("uses the tighter layout for nested regions, does not duplicate or drop unmatched text", () => {
  const unmatched = line("outside", [10, 90, 60, 99]);
  const unlocated = { text: "no coordinates" };
  const result = groupImageTextByLayout(
    {
      imageSize: layout.imageSize,
      items: [
        line("正文", [5, 5, 90, 10]),
        line("第二行", [5, 20, 90, 25]),
        unmatched,
        unlocated,
      ],
    },
    {
      ...layout,
      regions: [...layout.regions, region("container", [0, 0, 100, 85], 2)],
    }
  );
  expect(result.items.map((item) => item.text)).toEqual([
    "正文第二行",
    "outside",
    "no coordinates",
  ]);
  expect(result.items[0].box).toEqual([0, 0, 100, 40]);
  expect(result.items.slice(1)).toEqual([unmatched, unlocated]);
});

test("honors explicit model reading order and preserves layout polygons", () => {
  const polygon = [
    [0, 0],
    [90, 0],
    [100, 40],
    [0, 40],
  ];
  const result = groupImageTextByLayout(
    {
      imageSize: layout.imageSize,
      items: [line("first", [5, 5, 90, 10]), line("second", [5, 55, 90, 60])],
    },
    {
      ...layout,
      readingOrder: ["second", "first"],
      regions: [{ ...layout.regions[1], polygon }, layout.regions[0]],
    }
  );
  expect(result.items.map((item) => item.text)).toEqual(["second", "first"]);
  expect(result.items[1].poly).toEqual(polygon);
});

const layoutApi = {
  apiSlug: "layout",
  modelRef: "pp-doclayout-v3-onnx",
  device: "wasm",
};
const selection = { apiSlug: "ocr", capability: "recognizeText" };

describe.each([
  undefined,
  {},
  { width: 0, height: 100 },
  { width: 100, height: -1 },
  { width: Infinity, height: 100 },
  { width: 100, height: NaN },
])("invalid layout image size %j", (imageSize) => {
  const invalidLayout = { ...layout, imageSize };
  const recognized = {
    imageSize: layout.imageSize,
    items: [line("preserved", [5, 5, 90, 10])],
    text: "preserved",
    inputAdjustments: [{ message: "original notice" }],
  };
  test("direct grouping preserves the recognition result", () => {
    expect(groupImageTextByLayout(recognized, invalidLayout)).toEqual({
      ...recognized,
      layoutApplied: false,
    });
  });
  test.each([true, false])(
    "whole-image fallback with coordinates %s",
    async (coordinates) => {
      const file = new Blob(["image"]);
      const signal = new AbortController().signal;
      const client = {
        analyzeLayout: jest.fn().mockResolvedValue(invalidLayout),
        recognize: jest.fn().mockResolvedValue(recognized),
      };
      await expect(
        recognizeImageWithLayout(file, {
          client,
          selection,
          layoutApi,
          coordinates,
          signal,
          cacheMode: "refresh",
        })
      ).resolves.toEqual({ ...recognized, layoutApplied: false });
      expect(client.recognize).toHaveBeenCalledTimes(1);
      expect(client.recognize).toHaveBeenCalledWith(file, selection, signal, {
        cacheMode: "refresh",
      });
    }
  );
});

test("analyzes layout before OCR and forwards service, abort and refresh settings", async () => {
  const signal = new AbortController().signal;
  const file = new Blob(["image"]);
  const client = {
    analyzeLayout: jest.fn().mockResolvedValue(layout),
    recognize: jest.fn().mockResolvedValue({
      imageSize: layout.imageSize,
      items: [line("one", [5, 5, 90, 10]), line("two", [5, 20, 90, 25])],
    }),
  };
  const result = await recognizeImageWithLayout(file, {
    client,
    selection,
    layoutApi,
    signal,
    coordinates: true,
    cacheMode: "refresh",
    promptSlug: "doc",
  });
  expect(client.analyzeLayout).toHaveBeenCalledWith(
    file,
    layoutApi.modelRef,
    "wasm",
    signal,
    "layout",
    "refresh"
  );
  expect(client.recognize).toHaveBeenCalledWith(file, selection, signal, {
    cacheMode: "refresh",
    promptSlug: "doc",
  });
  expect(result.items[0].text).toBe("one two");
});

test("cancellation after layout prevents OCR", async () => {
  const abort = new AbortController();
  const client = {
    analyzeLayout: jest.fn(async () => {
      abort.abort();
      return layout;
    }),
    recognize: jest.fn(),
  };
  await expect(
    recognizeImageWithLayout(new Blob(), {
      client,
      selection,
      layoutApi,
      signal: abort.signal,
      coordinates: true,
    })
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(client.recognize).not.toHaveBeenCalled();
});

test("text-only services recognize layout crops and receive original-image region coordinates", async () => {
  const previous = globalThis.createImageBitmap;
  const close = jest.fn(),
    drawImage = jest.fn();
  globalThis.createImageBitmap = jest
    .fn()
    .mockResolvedValue({ width: 200, height: 200, close });
  const context = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ drawImage });
  const toBlob = jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => callback(new Blob(["crop"])));
  const client = {
    analyzeLayout: jest.fn().mockResolvedValue(layout),
    recognize: jest
      .fn()
      .mockResolvedValueOnce({ text: "paragraph one" })
      .mockResolvedValueOnce({ text: "paragraph two" }),
  };
  try {
    const result = await recognizeImageWithLayout(new Blob(), {
      client,
      selection,
      layoutApi,
      coordinates: false,
    });
    expect(client.recognize).toHaveBeenCalledTimes(2);
    expect(result.imageSize).toEqual({ width: 200, height: 200 });
    expect(result.items.map((item) => item.text)).toEqual([
      "paragraph one",
      "paragraph two",
    ]);
    expect(result.items[0].poly).toEqual(poly([0, 0, 200, 80]));
    expect(drawImage.mock.calls[0].slice(1)).toEqual([
      0, 0, 200, 80, 0, 0, 200, 80,
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.createImageBitmap = previous;
    context.mockRestore();
    toBlob.mockRestore();
  }
});

describe("layout regions outside the image", () => {
  let previous, context, toBlob, image, drawImage;
  const outside = region("outside", [110, 0, 120, 20], 0);
  beforeEach(() => {
    previous = globalThis.createImageBitmap;
    image = { width: 200, height: 200, close: jest.fn() };
    globalThis.createImageBitmap = jest.fn().mockResolvedValue(image);
    drawImage = jest.fn();
    context = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage });
    toBlob = jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["crop"])));
  });
  afterEach(() => {
    globalThis.createImageBitmap = previous;
    context.mockRestore();
    toBlob.mockRestore();
  });
  test("clamps scaled boxes and polygon vertices, skipping fully outside regions", async () => {
    const clippedLayout = {
      ...layout,
      regions: [outside, region("partial", [-10, -20, 120, 70], 1)],
    };
    const client = {
      analyzeLayout: jest.fn().mockResolvedValue(clippedLayout),
      recognize: jest.fn().mockResolvedValue({ text: "visible" }),
    };
    const result = await recognizeImageWithLayout(new Blob(), {
      client,
      selection,
      layoutApi,
      coordinates: false,
    });
    expect(client.recognize).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(
      image,
      0,
      0,
      200,
      140,
      0,
      0,
      200,
      140
    );
    expect(result.imageSize).toEqual({ width: 200, height: 200 });
    expect(result.items).toEqual([
      expect.objectContaining({
        text: "visible",
        box: [0, 0, 200, 140],
        poly: poly([0, 0, 200, 140]),
      }),
    ]);
    const grouped = groupImageTextByLayout(
      {
        imageSize: result.imageSize,
        items: [line("visible", [5, 5, 90, 10])],
      },
      clippedLayout
    );
    expect(grouped.items[0].box).toEqual(result.items[0].box);
    expect(grouped.items[0].poly).toEqual(result.items[0].poly);
    expect(image.close).toHaveBeenCalledTimes(1);
  });
  test.each([true, false])(
    "all unusable regions fall back with coordinates %s",
    async (coordinates) => {
      const file = new Blob(["whole image"]);
      const recognized = {
        imageSize: { width: 200, height: 200 },
        text: "whole text",
      };
      const client = {
        analyzeLayout: jest
          .fn()
          .mockResolvedValue({ ...layout, regions: [outside] }),
        recognize: jest.fn().mockResolvedValue(recognized),
      };
      await expect(
        recognizeImageWithLayout(file, {
          client,
          selection,
          layoutApi,
          coordinates,
          cacheMode: "refresh",
        })
      ).resolves.toEqual({ ...recognized, layoutApplied: false });
      expect(client.recognize).toHaveBeenCalledTimes(1);
      expect(client.recognize).toHaveBeenCalledWith(
        file,
        selection,
        undefined,
        { cacheMode: "refresh" }
      );
      expect(drawImage).not.toHaveBeenCalled();
      expect(image.close).toHaveBeenCalledTimes(coordinates ? 0 : 1);
    }
  );
  test("fallback recognition failure still closes the bitmap", async () => {
    const client = {
      analyzeLayout: jest
        .fn()
        .mockResolvedValue({ ...layout, regions: [outside] }),
      recognize: jest.fn().mockRejectedValue(new Error("OCR failed")),
    };
    await expect(
      recognizeImageWithLayout(new Blob(), {
        client,
        selection,
        layoutApi,
        coordinates: false,
      })
    ).rejects.toThrow("OCR failed");
    expect(image.close).toHaveBeenCalledTimes(1);
  });
});
