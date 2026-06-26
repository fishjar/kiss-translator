jest.mock("./log", () => ({
  kissLog: jest.fn(),
  logger: { info: jest.fn() },
}));

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
