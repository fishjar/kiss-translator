import { persistSubtitlePosition, runSubtitle } from "./subtitle.js";
import { saveEdit } from "../libs/storage.js";
import { logger } from "../libs/log.js";
import { STOKEY_SETTING } from "../config/storage.js";
import { YouTubeInitializer } from "./YouTubeCaptionProvider.js";

jest.mock("../libs/storage.js", () => ({
  saveEdit: jest.fn(),
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
  let setting;
  beforeEach(() => {
    jest.clearAllMocks();
    setting = {};
    saveEdit.mockImplementation(async (_key, update) => {
      setting = update(setting);
      return { value: setting, changed: true };
    });
  });

  test("merges the ratio without replacing unrelated settings", async () => {
    setting = {
      darkMode: "dark",
      subtitleSetting: {
        apiSlug: "microsoft",
        rememberPosition: true,
      },
    };

    await persistSubtitlePosition(0.3);

    expect(setting).toEqual({
      darkMode: "dark",
      subtitleSetting: {
        apiSlug: "microsoft",
        rememberPosition: true,
        positionRatio: 0.3,
      },
    });
    expect(saveEdit).toHaveBeenCalledWith(STOKEY_SETTING, expect.any(Function));
  });

  test("does not break subtitle rendering when storage fails", async () => {
    saveEdit.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(persistSubtitlePosition(0.3)).resolves.toBeUndefined();
    expect(setting).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("keeps complete subtitle defaults when storage is initially empty", async () => {
    await persistSubtitlePosition(0.3);

    expect(setting).toEqual(
      expect.objectContaining({
        subtitleSetting: expect.objectContaining({
          enabled: true,
          positionRatio: 0.3,
        }),
      })
    );
  });

  test("keeps the merge as a pure intent until storage supplies the latest settings", async () => {
    saveEdit.mockResolvedValueOnce({ changed: true });
    await persistSubtitlePosition(0.4);
    const update = saveEdit.mock.calls[0][1];
    const latest = Object.freeze({
      darkMode: "dark",
      subtitleSetting: Object.freeze({
        rememberPosition: true,
        positionRatio: 0.2,
      }),
    });
    expect(update(latest)).toEqual({
      darkMode: "dark",
      subtitleSetting: { rememberPosition: true, positionRatio: 0.4 },
    });
    expect(latest.subtitleSetting.positionRatio).toBe(0.2);
  });
});

describe("runSubtitle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(["disabled-api", "missing-api"])("does not fall back when the selected service %s is unavailable", (selectedSlug) => {
    const disabledApi = {
      apiSlug: "disabled-api",
      apiName: "Disabled API",
      apiType: "Microsoft",
      isDisabled: true,
    };
    const enabledApi = {
      apiSlug: "enabled-api",
      apiName: "Enabled API",
      apiType: "Microsoft",
    };

    runSubtitle({
      href: "https://www.youtube.com/watch?v=video-1",
      setting: {
        subtitleSetting: {
          enabled: true,
          apiSlug: selectedSlug,
        },
        transApis: [disabledApi, enabledApi],
      },
    });

    expect(YouTubeInitializer).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("start subtitle provider failed", expect.any(Error));
  });

  test("starts only the selected available service with the aligned runtime slug", () => {
    const selected = { apiSlug: "selected", apiType: "Microsoft" };
    const other = { apiSlug: "other", apiType: "Google" };
    runSubtitle({
      href: "https://www.youtube.com/watch?v=video-1",
      setting: {
        subtitleSetting: { enabled: true, apiSlug: selected.apiSlug },
        transApis: [other, selected],
      },
    });
    expect(YouTubeInitializer).toHaveBeenCalledTimes(1);
    expect(YouTubeInitializer).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSlug: selected.apiSlug,
        apiSetting: selected,
        transApis: [other, selected],
      })
    );
  });
});
