/**
 * @file paddleocr.test.js
 * @description 验证 PaddleOCR 三种产线的结果解析与异步任务调用。
 */

import { fetchPatcher } from "../libs/fetch";
import { createAssetStore } from "../providers/transport";
import {
  parsePaddleOcrPages,
  parsePaddleDocumentPages,
  parsePaddleStructurePages,
  recognizePaddleText,
  parsePaddleDocument,
  analyzePaddleLayout,
} from "./paddleocr";

jest.mock("../libs/fetch", () => ({ fetchPatcher: jest.fn() }));

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const createContext = () => {
  const assets = createAssetStore();
  return {
    assets,
    signal: new AbortController().signal,
    emit: jest.fn(async () => {}),
    image: assets.put(new Blob(["image"], { type: "image/png" })),
  };
};

const OCR_PAGE = {
  ocrResults: [
    {
      prunedResult: {
        rec_texts: ["Hello", "World"],
        rec_scores: [0.99, 0.88],
        rec_polys: [
          [
            [0, 0],
            [10, 0],
            [10, 5],
            [0, 5],
          ],
          [
            [0, 10],
            [10, 10],
            [10, 15],
            [0, 15],
          ],
        ],
      },
    },
  ],
};

beforeEach(() => {
  fetchPatcher.mockReset();
});

test("parsePaddleOcrPages converts text lines and polygons", () => {
  const result = parsePaddleOcrPages([OCR_PAGE]);
  expect(result.format).toBe("text");
  expect(result.text).toBe("Hello\nWorld");
  expect(result.items).toEqual([
    {
      text: "Hello",
      poly: [
        [0, 0],
        [10, 0],
        [10, 5],
        [0, 5],
      ],
      confidence: 0.99,
    },
    {
      text: "World",
      poly: [
        [0, 10],
        [10, 10],
        [10, 15],
        [0, 15],
      ],
      confidence: 0.88,
    },
  ]);
});

test("parsePaddleOcrPages falls back to rec_boxes and skips empty text", () => {
  const result = parsePaddleOcrPages([
    {
      ocrResults: [
        {
          prunedResult: {
            rec_texts: ["", "Box"],
            rec_boxes: [
              [0, 0, 0, 0],
              [2, 3, 20, 30],
            ],
          },
        },
      ],
    },
  ]);
  expect(result.items).toEqual([
    {
      text: "Box",
      poly: [
        [2, 3],
        [20, 3],
        [20, 30],
        [2, 30],
      ],
    },
  ]);
});

test("parsePaddleDocumentPages joins markdown pages", () => {
  expect(
    parsePaddleDocumentPages([
      {
        layoutParsingResults: [
          { markdown: { text: "# Title\n\nBody" } },
          { markdown: { text: "Second page" } },
        ],
      },
    ])
  ).toEqual({ text: "# Title\n\nBody\n\nSecond page", format: "markdown" });
});

test("parsePaddleStructurePages maps parsing_res_list to layout regions", () => {
  const result = parsePaddleStructurePages([
    {
      layoutParsingResults: [
        {
          prunedResult: {
            parsing_res_list: [
              {
                block_label: "doc_title",
                block_content: "Title",
                block_bbox: [1, 2, 30, 40],
                block_order: 1,
              },
              {
                block_label: "image",
                block_content: "",
                block_bbox: [0, 0, 10, 10],
                block_order: null,
              },
            ],
          },
        },
      ],
    },
  ]);
  expect(result.regions).toEqual([
    {
      type: "doc_title",
      poly: [
        [1, 2],
        [30, 2],
        [30, 40],
        [1, 40],
      ],
      order: 1,
    },
  ]);
});

test("recognizePaddleText submits a job, polls, and downloads JSONL", async () => {
  const ctx = createContext();
  fetchPatcher
    .mockResolvedValueOnce(
      response({ code: 0, msg: "Success", data: { jobId: "job-1" } })
    )
    .mockResolvedValueOnce(
      response({
        code: 0,
        data: {
          state: "done",
          resultUrl: { jsonUrl: "https://result.invalid/jsonl" },
        },
      })
    )
    .mockResolvedValueOnce(response(JSON.stringify({ result: OCR_PAGE })));

  const result = await recognizePaddleText(
    { image: ctx.image },
    {
      url: "https://paddleocr.invalid/jobs",
      key: "token-1",
      model: "PP-OCRv6",
    },
    ctx
  );

  expect(result.text).toBe("Hello\nWorld");
  const [submitUrl, submitInit] = fetchPatcher.mock.calls[0];
  expect(submitUrl).toBe("https://paddleocr.invalid/jobs");
  expect(submitInit.headers.Authorization).toBe("Bearer token-1");
  expect(submitInit.body).toBeInstanceOf(FormData);
  expect(submitInit.body.get("model")).toBe("PP-OCRv6");
  expect(JSON.parse(submitInit.body.get("optionalPayload"))).toEqual({
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useTextlineOrientation: false,
  });
  expect(fetchPatcher.mock.calls[1][0]).toBe(
    "https://paddleocr.invalid/jobs/job-1"
  );
  expect(fetchPatcher.mock.calls[2][0]).toBe("https://result.invalid/jsonl");
});

test("parsePaddleDocument uses the VLM layoutParsingResults output", async () => {
  const ctx = createContext();
  fetchPatcher
    .mockResolvedValueOnce(response({ code: 0, data: { jobId: "job-2" } }))
    .mockResolvedValueOnce(
      response({
        code: 0,
        data: {
          state: "done",
          resultUrl: { jsonUrl: "https://result.invalid/jsonl" },
        },
      })
    )
    .mockResolvedValueOnce(
      response(
        JSON.stringify({
          result: {
            layoutParsingResults: [{ markdown: { text: "# Doc" } }],
          },
        })
      )
    );

  const result = await parsePaddleDocument(
    { image: ctx.image },
    {
      url: "https://paddleocr.invalid/jobs",
      key: "token-1",
      model: "PaddleOCR-VL-1.6",
    },
    ctx
  );

  expect(result).toEqual({ text: "# Doc", format: "markdown" });
  expect(
    JSON.parse(fetchPatcher.mock.calls[0][1].body.get("optionalPayload"))
  ).toEqual({
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useChartRecognition: false,
  });
});

test("analyzePaddleLayout returns regions from PP-StructureV3", async () => {
  const ctx = createContext();
  fetchPatcher
    .mockResolvedValueOnce(response({ code: 0, data: { jobId: "job-3" } }))
    .mockResolvedValueOnce(
      response({
        code: 0,
        data: {
          state: "done",
          resultUrl: { jsonUrl: "https://result.invalid/jsonl" },
        },
      })
    )
    .mockResolvedValueOnce(
      response(
        JSON.stringify({
          result: {
            layoutParsingResults: [
              {
                prunedResult: {
                  parsing_res_list: [
                    {
                      block_label: "text",
                      block_content: "Body",
                      block_bbox: [5, 6, 50, 60],
                      block_order: 0,
                    },
                  ],
                },
              },
            ],
          },
        })
      )
    );

  const result = await analyzePaddleLayout(
    { image: ctx.image },
    {
      url: "https://paddleocr.invalid/jobs",
      key: "token-1",
      model: "PP-StructureV3",
    },
    ctx
  );

  expect(result.regions).toHaveLength(1);
  expect(result.regions[0]).toMatchObject({ type: "text", order: 0 });
  expect(
    JSON.parse(fetchPatcher.mock.calls[0][1].body.get("optionalPayload"))
  ).toEqual({
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useChartRecognition: false,
    useTableRecognition: true,
    useFormulaRecognition: true,
  });
});

test("missing access token fails before any request is sent", async () => {
  const ctx = createContext();
  await expect(
    recognizePaddleText({ image: ctx.image }, { model: "PP-OCRv6" }, ctx)
  ).rejects.toMatchObject({ code: "INVALID_CONFIG" });
  expect(fetchPatcher).not.toHaveBeenCalled();
});
