jest.mock("./log", () =>
  jest.requireActual("../testUtils/scopedLogMock").withScopedLogMock(
    (() => ({
      kissLog: jest.fn(),
      logger: { info: jest.fn() },
    }))()
  )
);

const loadChromeDetect = (detectResults) => {
  const detect = jest
    .fn()
    .mockImplementation(() => Promise.resolve(detectResults.shift()));
  global.LanguageDetector = {
    availability: jest.fn(() => Promise.resolve("available")),
    create: jest.fn(() => Promise.resolve({ detect })),
  };

  const { chromeDetect } = require("./builtinAI");
  return { chromeDetect, detect };
};

describe("chromeTranslate newline boundary", () => {
  afterEach(() => {
    delete global.Translator;
    delete global.LanguageDetector;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("detects original text and encodes LF only for the translation model", async () => {
    const { detect } = loadChromeDetect([
      [{ detectedLanguage: "en", confidence: 1 }],
    ]);
    const translate = jest.fn(async (text) => text);
    global.Translator = {
      availability: jest.fn(async () => "available"),
      create: jest.fn(async () => ({ translate })),
    };
    const { chromeTranslate } = require("./builtinAI");
    const text = "First\n\nSecond &amp;\tcolumn";
    await expect(
      chromeTranslate({ text, from: "auto", to: "zh" })
    ).resolves.toEqual([text, "en", ""]);
    expect(detect).toHaveBeenCalledWith(text);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("First<br><br>Second &amp;\tcolumn");
  });

  test("preserves HTML tags and existing br without double encoding", async () => {
    const translate = jest.fn(async (text) => text);
    global.Translator = {
      availability: jest.fn(async () => "available"),
      create: jest.fn(async () => ({ translate })),
    };
    const { chromeTranslate } = require("./builtinAI");
    await expect(
      chromeTranslate({
        text: "<i1>First\n\nSecond</i1><br>",
        from: "en",
        to: "zh",
        textFormat: "html",
      })
    ).resolves.toEqual(["<i1>First<br><br>Second</i1><br>", "en", ""]);
    expect(translate).toHaveBeenCalledTimes(1);
  });
});

describe("chromeDetect", () => {
  afterEach(() => {
    delete global.LanguageDetector;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("uses 0.4 as the default confidence threshold", async () => {
    const { chromeDetect } = loadChromeDetect([
      [{ detectedLanguage: "en", confidence: 0.39 }],
    ]);

    const result = await chromeDetect({ text: "hello" });

    expect(result[0]).toBe("");
    expect(result[1]).toContain(
      "Confidence of test results (en 0.39) below the set threshold 0.4"
    );
  });

  test("falls back to the last reliable detected language", async () => {
    const { chromeDetect } = loadChromeDetect([
      [{ detectedLanguage: "en", confidence: 0.9 }],
      [{ detectedLanguage: "fr", confidence: 0.39 }],
    ]);

    await expect(chromeDetect({ text: "first" })).resolves.toEqual(["en", ""]);
    await expect(chromeDetect({ text: "second" })).resolves.toEqual(["en", ""]);
  });

  test("does not cache low-confidence detected languages", async () => {
    const { chromeDetect } = loadChromeDetect([
      [{ detectedLanguage: "en", confidence: 0.39 }],
      [{ detectedLanguage: "fr", confidence: 0.39 }],
    ]);

    const first = await chromeDetect({ text: "first" });
    const second = await chromeDetect({ text: "second" });

    expect(first[0]).toBe("");
    expect(first[1]).toContain(
      "Confidence of test results (en 0.39) below the set threshold 0.4"
    );
    expect(second[0]).toBe("");
    expect(second[1]).toContain(
      "Confidence of test results (fr 0.39) below the set threshold 0.4"
    );
  });

  test("updates the fallback when a new reliable language is detected", async () => {
    const { chromeDetect } = loadChromeDetect([
      [{ detectedLanguage: "en", confidence: 0.9 }],
      [{ detectedLanguage: "de", confidence: 0.8 }],
      [{ detectedLanguage: "fr", confidence: 0.39 }],
    ]);

    await expect(chromeDetect({ text: "first" })).resolves.toEqual(["en", ""]);
    await expect(chromeDetect({ text: "second" })).resolves.toEqual(["de", ""]);
    await expect(chromeDetect({ text: "third" })).resolves.toEqual(["de", ""]);
  });
});
