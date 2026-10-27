/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import DictCont from "./DictCont";
import { loadDictionary } from "./loadDictionary";
import { useAsyncNow } from "../../hooks/Fetch";
import { apiTranslate } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Fetch", () => ({
  useAsyncNow: jest.fn(),
}));

jest.mock("../../apis", () => ({
  apiTranslate: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("./DictHandler", () => ({
  dictHandlers: {
    Bing: {
      apiFn: jest.fn(),
      reWord: (data) => (data ? data.word : ""),
      toText: (data) => (data ? data.lines : []),
      uiAudio: () => null,
      uiTrans: () => null,
    },
  },
}));

jest.mock("./CopyBtn", () => {
  const React = require("react");
  return function MockCopyButton({ text }) {
    return React.createElement(
      "button",
      { type: "button", "data-copy-text": text },
      "copy"
    );
  };
});

jest.mock("./FavBtn", () => {
  const React = require("react");
  return function MockFavoriteButton({ word, source }) {
    return React.createElement(
      "button",
      {
        type: "button",
        "data-favorite-word": word,
        "data-source-sentence": source?.sentence || "",
        "data-source-url": source?.url || "",
      },
      "favorite"
    );
  };
});

beforeEach(() => {
  apiTranslate.mockReset();
  useAsyncNow.mockReset();
});

test("resets dictionary actions to the current query while loading", async () => {
  useAsyncNow.mockReturnValue({
    loading: false,
    error: null,
    data: { word: "previous lemma", lines: ["previous definition"] },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<DictCont text="previous" enDict="Bing" />);
    await Promise.resolve();
  });
  expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
    "previous lemma\nprevious definition"
  );

  useAsyncNow.mockReturnValue({ loading: true, error: null, data: null });
  act(() => root.render(<DictCont text="current" enDict="Bing" />));

  expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
    "current"
  );
  expect(
    container.querySelector("[data-favorite-word]").dataset.favoriteWord
  ).toBe("current");
  expect(container.querySelector(".MuiCircularProgress-root")).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});

test("forwards the selected webpage source to the favorite button", async () => {
  useAsyncNow.mockReturnValue({
    loading: false,
    error: null,
    data: { word: "library", lines: ["definition"] },
  });
  const source = {
    sentence: "The library is open.",
    url: "https://example.com/article",
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<DictCont text="library" enDict="Bing" source={source} />);
    await Promise.resolve();
  });

  const favorite = container.querySelector("[data-favorite-word]");
  expect(favorite.dataset.sourceSentence).toBe(source.sentence);
  expect(favorite.dataset.sourceUrl).toBe(source.url);

  act(() => root.unmount());
  container.remove();
});

test("localizes definitions with the selected target and dedupes equal fields", async () => {
  const apiSetting = { apiSlug: "microsoft", apiType: "Microsoft" };
  const localize = jest.fn(async (data, translate) => ({
    ...data,
    lines: await Promise.all(data.lines.map(translate)),
  }));
  const dict = {
    apiFn: jest.fn().mockResolvedValue({
      word: "translator",
      lines: ["译者", "翻译员", "译者"],
    }),
    getLocalizationValues: (data) => data.lines,
    localize,
  };
  apiTranslate.mockImplementation(async ({ text }) => ({
    trText: text.replaceAll("译者", "مترجم").replaceAll("翻译员", "المترجم"),
  }));

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting,
      translateVariants: true,
    })
  ).resolves.toEqual({
    word: "translator",
    lines: ["مترجم", "المترجم", "مترجم"],
  });
  expect(apiTranslate).toHaveBeenCalledTimes(1);
  expect(apiTranslate).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining("{{KTD0}}译者"),
      fromLang: "zh-CN",
      toLang: "ar",
      apiSetting,
      translateVariants: true,
      textFormat: "text",
    })
  );
  expect(apiTranslate.mock.calls[0][0].text).toContain("翻译员");
  expect(apiTranslate.mock.calls[0][0]).not.toHaveProperty("signal");
  expect(localize).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Function),
    { toLang: "ar" }
  );
});

test("keeps the source dictionary data for a matching Chinese target", async () => {
  const data = { word: "translator", lines: ["译者"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    localize: jest.fn(),
  };

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "zh-CN",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(dict.localize).not.toHaveBeenCalled();
  expect(apiTranslate).not.toHaveBeenCalled();
});

test("falls back to the source dictionary when localization fails", async () => {
  const data = { word: "translator", lines: ["译者"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    getLocalizationValues: (value) => value.lines,
    localize: jest.fn(),
  };
  apiTranslate.mockRejectedValue(new Error("provider unavailable"));

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(apiTranslate).toHaveBeenCalledTimes(1);
  expect(dict.localize).not.toHaveBeenCalled();
});

test("falls back when the translation response does not preserve field markers", async () => {
  const data = { word: "translator", lines: ["译者", "翻译员"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    getLocalizationValues: (value) => value.lines,
    localize: jest.fn(),
  };
  apiTranslate.mockResolvedValue({ trText: "مترجم\nالمترجم" });

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(dict.localize).not.toHaveBeenCalled();
});

test("falls back when the translation response duplicates field markers", async () => {
  const data = { word: "translator", lines: ["译者", "翻译员"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    getLocalizationValues: (value) => value.lines,
    localize: jest.fn(),
  };
  apiTranslate.mockResolvedValue({
    trText: "{{KTD0}}مترجم\n{{KTD0}}مترجم\n{{KTD1}}المترجم",
  });

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(dict.localize).not.toHaveBeenCalled();
});

test("falls back when the translation provider aborts an active request", async () => {
  const data = { word: "translator", lines: ["译者"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    getLocalizationValues: (value) => value.lines,
    localize: jest.fn(),
  };
  apiTranslate.mockRejectedValue(
    new DOMException("The provider aborted the request.", "AbortError")
  );

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(dict.localize).not.toHaveBeenCalled();
});

test("falls back when rebuilding the localized dictionary fails", async () => {
  const data = { word: "translator", lines: ["译者"] };
  const dict = {
    apiFn: jest.fn().mockResolvedValue(data),
    getLocalizationValues: (value) => value.lines,
    localize: jest.fn().mockRejectedValue(new Error("invalid dictionary data")),
  };
  apiTranslate.mockImplementation(async ({ text }) => ({
    trText: text.replace("译者", "مترجم"),
  }));

  await expect(
    loadDictionary({
      dict,
      text: "translator",
      toLang: "ar",
      apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
      translateVariants: true,
    })
  ).resolves.toBe(data);
  expect(dict.localize).toHaveBeenCalledTimes(1);
});

test("does not enqueue localization after the dictionary lookup was aborted", async () => {
  const controller = new AbortController();
  const dict = {
    apiFn: jest.fn().mockImplementation(async () => {
      controller.abort();
      return { word: "translator", lines: ["译者"] };
    }),
    getLocalizationValues: (data) => data.lines,
    localize: jest.fn(),
  };

  await expect(
    loadDictionary(
      {
        dict,
        text: "translator",
        toLang: "ar",
        apiSetting: { apiSlug: "microsoft", apiType: "Microsoft" },
        translateVariants: true,
      },
      { signal: controller.signal }
    )
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(apiTranslate).not.toHaveBeenCalled();
});

test("changes the dictionary request identity when the target changes", () => {
  useAsyncNow.mockReturnValue({ loading: true, error: null, data: null });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiSetting = { apiSlug: "microsoft", apiType: "Microsoft" };

  act(() => {
    root.render(
      <DictCont
        text="translator"
        enDict="Bing"
        toLang="zh-CN"
        apiSetting={apiSetting}
      />
    );
  });
  expect(useAsyncNow.mock.calls.at(-1)[1]).toEqual(
    expect.objectContaining({ text: "translator", toLang: "zh-CN" })
  );

  act(() => {
    root.render(
      <DictCont
        text="translator"
        enDict="Bing"
        toLang="ar"
        apiSetting={apiSetting}
      />
    );
  });
  expect(useAsyncNow.mock.calls.at(-1)[1]).toEqual(
    expect.objectContaining({ text: "translator", toLang: "ar" })
  );

  act(() => root.unmount());
  container.remove();
});
