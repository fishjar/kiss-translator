import { translatePlugin } from "./translationAdapter";
import { invokePlugin } from "./bridge";
jest.mock("./bridge", () => ({ invokePlugin: jest.fn() }));
const provider = { implementation: { kind: "script" } };

test("plugin adapter maps stable IDs back to BatchQueue indexes regardless of order", async () => {
  const cancel = jest.fn();
  invokePlugin.mockReturnValue({
    cancel,
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "item.complete", id: "1", text: "乙" };
      },
    },
    result: Promise.resolve({
      items: [
        { id: "1", text: "乙" },
        { id: "0", text: "甲" },
      ],
    }),
  });
  const results = [];
  for await (const result of translatePlugin(["A", "B"], {
    apiSetting: { apiSlug: "original", provider },
    toLang: "zh",
  }))
    results.push(result);
  expect(results).toEqual([
    { id: 1, partialText: "乙", isComplete: false },
    { id: 1, result: ["乙", ""] },
    { id: 0, result: ["甲", ""] },
  ]);
  expect(invokePlugin.mock.calls[0][0]).toBe("original");
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("a row completion before a failed/truncated final response never reaches the cache as result", async () => {
  invokePlugin.mockReturnValue({
    cancel: jest.fn(),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "item.complete", id: "0", text: "preview" };
      },
    },
    result: Promise.reject(new Error("truncated")),
  });
  const rows = [];
  const consume = async () => {
    for await (const row of translatePlugin(["hello"], {
      apiSetting: { apiSlug: "id", provider },
      toLang: "zh-CN",
    }))
      rows.push(row);
  };
  await expect(consume()).rejects.toThrow("truncated");
  expect(rows).toEqual([{ id: 0, partialText: "preview", isComplete: false }]);
});

test("partial results do not hide a failed final invocation", async () => {
  const error = new Error("failed");
  invokePlugin.mockReturnValue({
    cancel: jest.fn(),
    events: { async *[Symbol.asyncIterator]() {} },
    result: Promise.reject(error),
  });
  const consume = async () => {
    for await (const _ of translatePlugin(["A"], {
      apiSetting: { apiSlug: "id", provider },
      toLang: "zh",
    })) {
    }
  };
  await expect(consume()).rejects.toBe(error);
});

test("plugin deltas accumulate for renderers and interface glossary overrides scene terms", async () => {
  invokePlugin.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.resolve({ items: [{ id: "0", text: "你好" }] }),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "item.delta", id: "0", text: "你" };
        yield { type: "item.delta", id: "0", text: "好" };
      },
    },
  });
  const output = [];
  for await (const item of translatePlugin(["hello"], {
    apiSetting: { apiSlug: "a", aiTerms: "term,API", provider },
    toLang: "zh",
    glossary: { term: "scene" },
    docInfo: { title: "page", context: "paragraph" },
  }))
    output.push(item);
  expect(output.slice(0, 2).map((item) => item.partialText)).toEqual([
    "你",
    "你好",
  ]);
  const input = invokePlugin.mock.calls.at(-1)[2];
  expect(input.glossary).toEqual({ term: "API" });
  expect(input.document.title).toBe("page");
  expect(input.context).toBe("paragraph");
});
