import { persistSubtitlePosition } from "./subtitle.js";
import { debounceSyncMeta, getSetting, setSetting } from "../libs/storage.js";
import { logger } from "../libs/log.js";
import { KV_SETTING_KEY } from "../config/storage.js";

jest.mock("../libs/storage.js", () => ({
  debounceSyncMeta: jest.fn(),
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

jest.mock("../libs/log.js", () => ({
  LogLevel: {
    INFO: { value: "info" },
  },
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../injectors/index.js", () => ({
  injectJs: jest.fn(),
  INJECTOR: { subtitle: "subtitle" },
}));

jest.mock("./YouTubeCaptionProvider.js", () => ({
  YouTubeInitializer: jest.fn(),
}));

describe("persistSubtitlePosition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("merges the ratio without replacing unrelated settings", async () => {
    getSetting.mockResolvedValue({
      darkMode: "dark",
      subtitleSetting: {
        apiSlug: "microsoft",
        rememberPosition: true,
      },
    });

    await persistSubtitlePosition(0.3);

    expect(setSetting).toHaveBeenCalledWith({
      darkMode: "dark",
      subtitleSetting: {
        apiSlug: "microsoft",
        rememberPosition: true,
        positionRatio: 0.3,
      },
    });
    expect(debounceSyncMeta).toHaveBeenCalledWith(KV_SETTING_KEY);
  });

  test("does not break subtitle rendering when storage fails", async () => {
    getSetting.mockRejectedValue(new Error("storage unavailable"));

    await expect(persistSubtitlePosition(0.3)).resolves.toBeUndefined();
    expect(setSetting).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(debounceSyncMeta).not.toHaveBeenCalled();
  });

  test("keeps complete subtitle defaults when storage is initially empty", async () => {
    getSetting.mockResolvedValue(null);

    await persistSubtitlePosition(0.3);

    expect(setSetting).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitleSetting: expect.objectContaining({
          enabled: true,
          positionRatio: 0.3,
        }),
      })
    );
  });

  test("serializes writes and merges each ratio into the latest settings", async () => {
    let finishFirstWrite;
    setSetting
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstWrite = resolve;
          })
      )
      .mockResolvedValueOnce();
    getSetting
      .mockResolvedValueOnce({
        darkMode: "light",
        subtitleSetting: { rememberPosition: true, positionRatio: 0.05 },
      })
      .mockResolvedValueOnce({
        darkMode: "dark",
        subtitleSetting: { rememberPosition: true, positionRatio: 0.2 },
      });

    const firstWrite = persistSubtitlePosition(0.3);
    const secondWrite = persistSubtitlePosition(0.4);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSetting).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledTimes(1);

    finishFirstWrite();
    await Promise.all([firstWrite, secondWrite]);

    expect(getSetting).toHaveBeenCalledTimes(2);
    expect(setSetting).toHaveBeenLastCalledWith({
      darkMode: "dark",
      subtitleSetting: {
        rememberPosition: true,
        positionRatio: 0.4,
      },
    });
    expect(debounceSyncMeta).toHaveBeenCalledTimes(2);
  });
});
