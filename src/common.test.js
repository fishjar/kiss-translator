const mockTranslatorManagerStart = jest.fn();
let mockIsIframe = false;

jest.mock("./config", () => ({
  OPT_HIGHLIGHT_WORDS_DISABLE: "-",
}));

jest.mock("./libs/storage", () => ({
  getSettingWithDefault: jest.fn(),
  getFabWithDefault: jest.fn(),
  getWordsWithDefault: jest.fn(),
}));

jest.mock("./libs/iframe", () => ({
  get isIframe() {
    return mockIsIframe;
  },
}));

jest.mock("./libs/gm", () => ({
  handlePing: jest.fn(),
  injectScript: jest.fn(),
}));

jest.mock("./libs/rules", () => ({
  matchRule: jest.fn(),
}));

jest.mock("./libs/subRules", () => ({
  trySyncAllSubRules: jest.fn(),
}));

jest.mock("./libs/blacklist", () => ({
  isInBlacklist: jest.fn(() => false),
}));

jest.mock("./subtitle/subtitle", () => ({
  runSubtitle: jest.fn(),
}));

jest.mock("./libs/log", () => ({
  logger: {
    setLevel: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("./libs/injector", () => ({
  injectInlineJs: jest.fn(),
}));

jest.mock("./libs/translatorManager", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    start: mockTranslatorManagerStart,
  })),
}));

const {
  getSettingWithDefault,
  getFabWithDefault,
  getWordsWithDefault,
} = require("./libs/storage");
const { matchRule } = require("./libs/rules");
const { runSubtitle } = require("./subtitle/subtitle");
const TranslatorManager = require("./libs/translatorManager").default;
const { run } = require("./common");

function setReadyState(value) {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value,
  });
}

describe("common iframe startup", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    setReadyState("complete");
    mockIsIframe = false;
    jest.clearAllMocks();

    TranslatorManager.mockImplementation(() => ({
      start: mockTranslatorManagerStart,
    }));
    getSettingWithDefault.mockResolvedValue({
      blacklist: "",
      tranboxSetting: { blacklist: "", transOpen: true },
      inputRule: { blacklist: "", transOpen: true },
      mouseHoverSetting: { blacklist: "", useMouseHover: true },
      logLevel: 1,
    });
    getFabWithDefault.mockResolvedValue({ isHide: false });
    getWordsWithDefault.mockResolvedValue({});
    matchRule.mockResolvedValue({
      transOpen: "true",
      highlightWords: "-",
    });
  });

  test("starts translator manager for iframe with text", async () => {
    mockIsIframe = true;
    document.body.innerHTML = "<main>Hello iframe</main>";

    await run();

    expect(matchRule).toHaveBeenCalledTimes(1);
    expect(TranslatorManager).toHaveBeenCalledTimes(1);
    expect(mockTranslatorManagerStart).toHaveBeenCalledTimes(1);
    expect(runSubtitle).not.toHaveBeenCalled();
  });

  test("skips empty iframe before rule matching and manager startup", async () => {
    mockIsIframe = true;
    document.body.innerHTML = `
      <script>const text = "ignored";</script>
      <style>.ignored { color: red; }</style>
      <textarea>ignored</textarea>
    `;

    await run();

    expect(matchRule).not.toHaveBeenCalled();
    expect(TranslatorManager).not.toHaveBeenCalled();
    expect(mockTranslatorManagerStart).not.toHaveBeenCalled();
  });

  test("waits for DOMContentLoaded before skipping loading iframe", async () => {
    mockIsIframe = true;
    setReadyState("loading");

    const running = run();
    await Promise.resolve();

    document.body.innerHTML = "<p>Late iframe text</p>";
    setReadyState("interactive");
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await running;

    expect(matchRule).toHaveBeenCalledTimes(1);
    expect(TranslatorManager).toHaveBeenCalledTimes(1);
    expect(mockTranslatorManagerStart).toHaveBeenCalledTimes(1);
  });

  test("does not apply empty-text gate to top-level pages", async () => {
    mockIsIframe = false;

    await run();

    expect(matchRule).toHaveBeenCalledTimes(1);
    expect(TranslatorManager).toHaveBeenCalledTimes(1);
    expect(mockTranslatorManagerStart).toHaveBeenCalledTimes(1);
    expect(runSubtitle).toHaveBeenCalledTimes(1);
  });
});
