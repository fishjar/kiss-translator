jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({ getDocInfo: () => ({}) }));

import {
  genTransReq,
  handleTranslate,
  handleSubtitle,
  handleSummarize,
} from "./trans";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_OPENAI,
} from "../config";
import { fetchData, fetchStream } from "../libs/fetch";

const { randomUUID, webcrypto } = require("crypto");
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const sessionHeader = "x-opencode-session";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const getApiSetting = (update = {}) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENCODEGO),
  key: "test-key",
  useBatchFetch: false,
  useStream: false,
  ...update,
});

const request = (update = {}) =>
  genTransReq({
    ...getApiSetting(),
    texts: ["hello"],
    from: "en",
    to: "zh-CN",
    fromLang: "en",
    toLang: "zh-CN",
    ...update,
  });

beforeEach(() => {
  window.history.replaceState({}, "", `/opencode-test-${randomUUID()}`);
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID: jest.fn(randomUUID),
      getRandomValues: jest.fn((bytes) => webcrypto.getRandomValues(bytes)),
    },
  });
});

afterEach(() => {
  jest.resetAllMocks();
  if (cryptoDescriptor) {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  } else {
    delete globalThis.crypto;
  }
});

test("concurrent batches and stream retries share a session without changing the request body", async () => {
  const requests = await Promise.all([
    request({ texts: ["first"] }),
    request({ texts: ["second", "third"], useBatchFetch: true }),
    request({ useStream: true }),
    request({ useStream: false }),
  ]);
  const ids = requests.map(([, init]) => init.headers[sessionHeader]);
  expect(ids[0]).toMatch(uuidPattern);
  expect(new Set(ids).size).toBe(1);
  expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(requests[0][1].headers.Authorization).toBe("Bearer test-key");
  expect(requests[0][1].method).toBe("POST");
  expect(JSON.parse(requests[2][1].body).stream).toBe(true);
  expect(JSON.parse(requests[3][1].body).stream).toBe(false);
  expect(JSON.parse(requests[0][1].body)).not.toHaveProperty("session_id");
});

test("separates interface configurations, endpoints and SPA pages", async () => {
  const first = await request();
  const otherApi = await request({ apiSlug: "other-opencode-go" });
  const otherUrl = await request({
    url: "https://proxy.example.com/v1/chat/completions",
  });
  const repeated = await request();
  expect(repeated[1].headers[sessionHeader]).toBe(
    first[1].headers[sessionHeader]
  );
  window.history.replaceState({}, "", "/another-page");
  const navigated = await request();
  expect(
    new Set(
      [first, otherApi, otherUrl, navigated].map(
        ([, init]) => init.headers[sessionHeader]
      )
    ).size
  ).toBe(4);
});

test("creates a stable UUID when randomUUID is unavailable on an HTTP page", async () => {
  globalThis.crypto.randomUUID = undefined;
  const first = await request();
  const repeated = await request();
  expect(first[1].headers[sessionHeader]).toMatch(uuidPattern);
  expect(repeated[1].headers[sessionHeader]).toBe(
    first[1].headers[sessionHeader]
  );
  expect(globalThis.crypto.getRandomValues).toHaveBeenCalledTimes(1);
});

test.each(["x-opencode-session", "X-OpenCode-Session"])(
  "preserves an explicit %s header without duplicates",
  async (name) => {
    const [, init] = await request({
      customHeader: JSON.stringify({ [name]: "user-session" }),
    });
    const entries = Object.entries(init.headers).filter(
      ([key]) => key.toLowerCase() === sessionHeader
    );
    expect(entries).toEqual([[name, "user-session"]]);
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
  }
);

test("does not add OpenCode headers to other providers", async () => {
  const [, init] = await request({
    apiType: OPT_TRANS_OPENAI,
    url: "https://api.openai.com/v1/chat/completions",
  });
  expect(init.headers).not.toHaveProperty(sessionHeader);
  expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
});

test("the documented hook overrides a session while preserving auth, prompts and stream settings", async () => {
  const fs = require("fs");
  const path = require("path");
  const doc = fs.readFileSync(
    path.join(__dirname, "../../custom-api_v2.md"),
    "utf8"
  );
  const section = doc
    .split("## OpenCode 会话请求头")[1]
    .split("## 谷歌翻译接口")[0];
  const hook = section.match(/```js\r?\n([\s\S]*?)```/)[1];
  const options = {
    useStream: true,
    customHeader: JSON.stringify({ "X-OpenCode-Session": "old-session" }),
  };
  const [url, original, userMsg] = await request(options);
  const [hookUrl, hooked, hookUserMsg] = await request({
    ...options,
    reqHook: hook,
  });
  expect(hookUrl).toBe(url);
  expect(hooked.body).toBe(original.body);
  expect(hooked.method).toBe(original.method);
  expect(hookUserMsg).toEqual(userMsg);
  expect(hooked.headers.Authorization).toBe(original.headers.Authorization);
  expect(hooked.headers[sessionHeader]).toBe(
    "8fd946a1-bb92-4aa6-9766-724c9e435832"
  );
  expect(hooked.headers).not.toHaveProperty("X-OpenCode-Session");
});

test("stream fallback preserves the session sent by the streaming request", async () => {
  fetchStream.mockImplementation(async function* () {
    throw new Error("stream unavailable");
  });
  fetchData.mockResolvedValue({ choices: [{ message: { content: "你好" } }] });
  const results = [];
  for await (const item of handleTranslate(["hello"], {
    apiSetting: getApiSetting({ useStream: true }),
    from: "en",
    to: "zh-CN",
    fromLang: "en",
    toLang: "zh-CN",
    langMap: () => "",
    usePool: false,
  }))
    results.push(item);
  expect(results[0].result[0]).toBe("你好");
  const streaming = fetchStream.mock.calls[0][1];
  const fallback = fetchData.mock.calls[0][1];
  expect(streaming.headers[sessionHeader]).toMatch(uuidPattern);
  expect(fallback.headers[sessionHeader]).toBe(
    streaming.headers[sessionHeader]
  );
});

test("subtitle and summary requests also carry the session without relying on hooks", async () => {
  fetchData.mockResolvedValueOnce({
    choices: [
      {
        message: { content: JSON.stringify([{ e: 0, o: "hello", t: "你好" }]) },
      },
    ],
  });
  const apiSetting = getApiSetting();
  await handleSubtitle({
    events: [{ start: 0, end: 1000, text: "hello" }],
    from: "en",
    to: "zh-CN",
    apiSetting,
  });
  fetchData.mockResolvedValueOnce({
    choices: [{ message: { content: "A greeting." } }],
  });
  await handleSummarize({ title: "Example", transcript: "hello", apiSetting });
  const subtitleId = fetchData.mock.calls[0][1].headers[sessionHeader];
  expect(subtitleId).toMatch(uuidPattern);
  expect(fetchData.mock.calls[1][1].headers[sessionHeader]).toBe(subtitleId);
});
