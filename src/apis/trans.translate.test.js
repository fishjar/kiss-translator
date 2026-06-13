jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

import { handleTranslate } from "./trans";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";
import { fetchData, fetchStream } from "../libs/fetch";

const getApiSetting = (apiType) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === apiType),
  useStream: true,
  useBatchFetch: true,
  key: "test-key",
  model: "test-model",
  fetchInterval: 0,
  fetchLimit: 1,
  httpTimeout: 1000,
});

async function collectAsyncGenerator(generator) {
  const result = [];
  for await (const item of generator) {
    result.push(item);
  }
  return result;
}

describe("handleTranslate", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("falls back to non-stream request when stream reader is unsupported", async () => {
    async function* brokenStream() {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'getReader')"
      );
    }

    fetchStream.mockReturnValueOnce(brokenStream());
    fetchData.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([{ text: "你好", sourceLanguage: "en" }]),
          },
        },
      ],
    });

    const result = await collectAsyncGenerator(
      handleTranslate(["hello"], {
        from: "en",
        to: "zh-CN",
        fromLang: "English",
        toLang: "Chinese",
        langMap: () => "",
        glossary: "",
        apiSetting: getApiSetting(OPT_TRANS_OPENAI),
        usePool: false,
      })
    );

    expect(fetchStream).toHaveBeenCalledTimes(1);
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchStream.mock.calls[0][1].body).stream).toBe(true);
    expect(JSON.parse(fetchData.mock.calls[0][1].body).stream).toBe(false);
    expect(result).toEqual([
      {
        id: 0,
        result: [JSON.stringify([{ text: "你好", sourceLanguage: "en" }]), ""],
      },
    ]);
  });

  test("does not fall back when stream request is aborted", async () => {
    async function* abortedStream() {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    fetchStream.mockReturnValueOnce(abortedStream());

    await expect(
      collectAsyncGenerator(
        handleTranslate(["hello"], {
          from: "en",
          to: "zh-CN",
          fromLang: "English",
          toLang: "Chinese",
          langMap: () => "",
          glossary: "",
          apiSetting: getApiSetting(OPT_TRANS_OPENAI),
          usePool: false,
        })
      )
    ).rejects.toThrow("The operation was aborted.");

    expect(fetchData).not.toHaveBeenCalled();
  });
});
