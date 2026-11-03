/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import SugCont from "./SugCont";
import { apiBaiduSuggest, apiYoudaoSuggest, apiTranslate } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiBaiduSuggest: jest.fn(),
  apiYoudaoSuggest: jest.fn(),
  apiTranslate: jest.fn(),
}));

jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));

const apiSetting = { apiSlug: "microsoft", apiType: "Microsoft" };
const baiduEntries = Object.freeze([
  Object.freeze({ k: "amoroso", v: "葡萄醇香酒" }),
  Object.freeze({ k: "amorosity", v: "多情" }),
]);
const youdaoEntries = Object.freeze([
  Object.freeze({ entry: "amoroso", explain: "葡萄醇香酒" }),
  Object.freeze({ entry: "amorosity", explain: "多情" }),
]);
const definitions = {
  ar: ["نبيذ", "عاطفي"],
  fa: ["شراب", "عاطفی"],
  "zh-TW": ["葡萄醇香酒", "多情"],
};

const translatedResponse = (text, toLang) => ({
  trText: text
    .replaceAll("葡萄醇香酒", definitions[toLang][0])
    .replaceAll("多情", definitions[toLang][1]),
});

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let container;
let root;

beforeEach(() => {
  jest.resetAllMocks();
  apiBaiduSuggest.mockResolvedValue(baiduEntries);
  apiYoudaoSuggest.mockResolvedValue(youdaoEntries);
  apiTranslate.mockImplementation(async ({ text, toLang }) =>
    translatedResponse(text, toLang)
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderSuggestions(props = {}) {
  await act(async () => {
    root.render(
      <SugCont
        text="amoroso"
        enSug="Youdao"
        toLang="ar"
        apiSetting={apiSetting}
        {...props}
      />
    );
  });
}

describe.each(["Baidu", "Youdao"])("%s suggestions", (enSug) => {
  test.each(["ar", "fa"])(
    "renders definitions in %s while retaining suggested words",
    async (toLang) => {
      await renderSuggestions({ enSug, toLang });

      expect(container.textContent).toContain("amoroso");
      expect(container.textContent).toContain("amorosity");
      expect(
        [...container.querySelectorAll("li")].map((li) => li.textContent)
      ).toEqual(definitions[toLang]);
      expect(container.textContent).not.toMatch(/葡萄醇香酒|多情/);
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(apiTranslate).toHaveBeenCalledWith(
        expect.objectContaining({ fromLang: "zh-CN", toLang, apiSetting })
      );
      expect(apiTranslate.mock.calls[0][0].text).not.toContain("amoroso");
      expect(apiTranslate.mock.calls[0][0]).not.toHaveProperty("signal");
      const request = enSug === "Baidu" ? apiBaiduSuggest : apiYoudaoSuggest;
      expect(request).toHaveBeenCalledWith("amoroso");
      // Re-rendering Chinese also verifies that cached source entries were not mutated.
      await renderSuggestions({ enSug, toLang: "zh-CN" });
      expect(
        [...container.querySelectorAll("li")].map((li) => li.textContent)
      ).toEqual(["葡萄醇香酒", "多情"]);
      expect(apiTranslate).toHaveBeenCalledTimes(1);
    }
  );

  test.each(["unavailable", "malformed"])(
    "keeps the original suggestions if localization is %s",
    async (failure) => {
      if (failure === "unavailable") {
        apiTranslate.mockRejectedValue(new Error("provider unavailable"));
      } else {
        apiTranslate.mockResolvedValue({ trText: "missing field markers" });
      }
      await renderSuggestions({ enSug });

      expect(container.textContent).toContain("amoroso");
      expect(container.textContent).toContain("葡萄醇香酒");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    }
  );
});

test("clears previous-language suggestions and ignores a late obsolete translation", async () => {
  await renderSuggestions({ toLang: "zh-CN" });
  expect(container.textContent).toContain("葡萄醇香酒");

  const arabic = deferred();
  const persian = deferred();
  apiTranslate.mockImplementation(({ toLang }) =>
    toLang === "ar" ? arabic.promise : persian.promise
  );
  await renderSuggestions({ toLang: "ar" });
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.textContent).not.toContain("葡萄醇香酒");

  await renderSuggestions({ toLang: "fa" });
  expect(apiTranslate.mock.calls.map(([query]) => query.toLang)).toEqual([
    "ar",
    "fa",
  ]);
  await act(async () => {
    persian.resolve(
      translatedResponse(apiTranslate.mock.calls[1][0].text, "fa")
    );
  });
  expect(
    [...container.querySelectorAll("li")].map((li) => li.textContent)
  ).toEqual(definitions.fa);

  await act(async () => {
    arabic.resolve(
      translatedResponse(apiTranslate.mock.calls[0][0].text, "ar")
    );
  });
  expect(
    [...container.querySelectorAll("li")].map((li) => li.textContent)
  ).toEqual(definitions.fa);
});

test("uses the newly selected translation service", async () => {
  await renderSuggestions();
  const nextApi = { apiSlug: "google", apiType: "Google" };
  await renderSuggestions({ apiSetting: nextApi });
  expect(apiTranslate.mock.calls.map(([query]) => query.apiSetting)).toEqual([
    apiSetting,
    nextApi,
  ]);
  expect(container.textContent).toContain(definitions.ar[0]);
});

test("respects Chinese variant translation when the setting changes", async () => {
  await renderSuggestions({ toLang: "zh-TW", translateVariants: false });
  expect(apiTranslate).not.toHaveBeenCalled();
  await renderSuggestions({ toLang: "zh-TW", translateVariants: true });
  expect(apiTranslate).toHaveBeenCalledWith(
    expect.objectContaining({ toLang: "zh-TW", translateVariants: true })
  );
});

test("keeps suggestions available to callers without translation settings", async () => {
  await renderSuggestions({ toLang: undefined, apiSetting: undefined });
  expect(container.textContent).toContain("葡萄醇香酒");
  expect(apiTranslate).not.toHaveBeenCalled();
});

test("does not send a localization request for an empty suggestion list", async () => {
  apiYoudaoSuggest.mockResolvedValue([]);
  await renderSuggestions();
  expect(container.querySelector("li")).toBeNull();
  expect(apiTranslate).not.toHaveBeenCalled();
});
