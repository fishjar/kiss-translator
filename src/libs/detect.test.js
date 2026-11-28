jest.mock("./browser", () => ({
  browser: {
    i18n: {
      detectLanguage: jest.fn(),
    },
  },
}));

jest.mock("../apis", () => ({
  apiGoogleLangdetect: jest.fn(),
  apiBaiduLangdetect: jest.fn(),
  apiTencentLangdetect: jest.fn(),
  apiBuiltinAIDetect: jest.fn(),
}));

const { apiTencentLangdetect } = require("../apis");
const { OPT_TRANS_TENCENT } = require("../config");
const { browser } = require("./browser");
const {
  tryDetectLang,
  __resetRemoteDetectCooldownForTests,
} = require("./detect");

describe("tryDetectLang", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 失败冷却属于模块级状态，逐个用例重置，避免前一个用例让后一个跳过远程检测
    __resetRemoteDetectCooldownForTests();
  });

  test.each([
    ["zh-Hant", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["en-US", "en"],
    ["pt-BR", "pt"],
  ])("normalizes browser result %s to %s", async (language, expected) => {
    browser.i18n.detectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language, percentage: 100 }],
    });

    await expect(tryDetectLang("sample text")).resolves.toBe(expected);
  });

  test("keeps Tencent's generic Chinese result as simplified Chinese", async () => {
    apiTencentLangdetect.mockResolvedValue("zh");

    await expect(
      tryDetectLang("中文测试文本", OPT_TRANS_TENCENT)
    ).resolves.toBe("zh-CN");
    expect(browser.i18n.detectLanguage).not.toHaveBeenCalled();
  });

  test("falls back to the browser when a provider result is unsupported", async () => {
    apiTencentLangdetect.mockResolvedValue("unknown-provider-code");
    browser.i18n.detectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: "en-GB", percentage: 100 }],
    });

    await expect(
      tryDetectLang("English sample text", OPT_TRANS_TENCENT)
    ).resolves.toBe("en");
  });
});

describe("remote detection resilience", () => {
  // 让已排队的工作推进到“请求已发出、正等响应”的状态，再推进假时钟，
  // 否则定时器会先于请求本身触发，测不到真实的执行顺序。
  // 用原生 Promise 微任务：Jest 的 modern fake timers 连 nextTick / queueMicrotask 一起伪造。
  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetRemoteDetectCooldownForTests();
    browser.i18n.detectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: "en", percentage: 100 }],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 端点不可达时检测请求此前没有上限，只能等系统 TCP 超时；
  // 这 10 秒发生在插入占位符之前，表现为“点了翻译没有反应”。
  test("gives up on an unreachable endpoint instead of waiting for the socket timeout", async () => {
    jest.useFakeTimers();
    apiTencentLangdetect.mockImplementation(() => new Promise(() => {}));

    const pending = tryDetectLang("some text", OPT_TRANS_TENCENT);
    await flushMicrotasks();
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);

    await expect(pending).resolves.toBe("en");
    expect(browser.i18n.detectLanguage).toHaveBeenCalledTimes(1);
  });

  test("aborts the pending request when the timeout fires", async () => {
    jest.useFakeTimers();
    let observedSignal;
    apiTencentLangdetect.mockImplementation(
      (_text, { signal } = {}) =>
        new Promise((_, reject) => {
          observedSignal = signal;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );

    const pending = tryDetectLang("some text", OPT_TRANS_TENCENT);
    await flushMicrotasks();
    expect(observedSignal).toBeDefined();
    jest.advanceTimersByTime(2000);

    await expect(pending).resolves.toBe("en");
    expect(observedSignal?.aborted).toBe(true);
  });

  // 长页面按批次反复检测，坏端点不应每批都重付一次超时
  test("skips the failing endpoint until the cooldown expires", async () => {
    jest.useFakeTimers();
    apiTencentLangdetect.mockRejectedValue(new Error("Failed to fetch"));

    await tryDetectLang("first batch", OPT_TRANS_TENCENT);
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);

    await expect(
      tryDetectLang("second batch", OPT_TRANS_TENCENT)
    ).resolves.toBe("en");
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60000);
    await tryDetectLang("after cooldown", OPT_TRANS_TENCENT);
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(2);
  });

  test("applies a per-detector cooldown", async () => {
    jest.useFakeTimers();
    const { apiGoogleLangdetect } = require("../apis");
    const { OPT_TRANS_GOOGLE } = require("../config");
    apiGoogleLangdetect.mockResolvedValue("en");
    apiTencentLangdetect.mockRejectedValue(new Error("Failed to fetch"));

    await tryDetectLang("first batch", OPT_TRANS_TENCENT);
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);

    // Tencent 已被冷却跳过，但 Google 未被冷却，仍应真实发起请求
    await tryDetectLang("tencent again", OPT_TRANS_TENCENT);
    await tryDetectLang("google still works", OPT_TRANS_GOOGLE);

    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);
    expect(apiGoogleLangdetect).toHaveBeenCalledTimes(1);
  });

  // 超时同样算"端点不可用"，应进入冷却，而不是只用本地检测撑过一次
  test("cools down an endpoint that timed out", async () => {
    jest.useFakeTimers();
    apiTencentLangdetect.mockImplementation(() => new Promise(() => {}));

    const pending = tryDetectLang("first batch", OPT_TRANS_TENCENT);
    await flushMicrotasks();
    jest.advanceTimersByTime(2000);
    await expect(pending).resolves.toBe("en");
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);

    await expect(
      tryDetectLang("second batch", OPT_TRANS_TENCENT)
    ).resolves.toBe("en");
    expect(apiTencentLangdetect).toHaveBeenCalledTimes(1);
  });

  // BuiltinAI 走本机接口，不受网络超时和冷却影响
  test("leaves the local BuiltinAI detector unthrottled", async () => {
    jest.useFakeTimers();
    const { OPT_TRANS_BUILTINAI } = require("../config");
    const { apiBuiltinAIDetect } = require("../apis");
    apiBuiltinAIDetect.mockRejectedValue(new Error("not available"));

    await tryDetectLang("first batch", OPT_TRANS_BUILTINAI);
    await tryDetectLang("second batch", OPT_TRANS_BUILTINAI);

    expect(apiBuiltinAIDetect).toHaveBeenCalledTimes(2);
  });
});
