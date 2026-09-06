/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import FavWords from "./FavWords";
import { useFavWords } from "../../hooks/FavWords";
import { useSetting } from "../../hooks/Setting";
import { PROMPT_MODE_FOLLOW_API } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/FavWords", () => ({
  useFavWords: jest.fn(),
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: jest.fn(),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => jest.fn(),
}));

jest.mock("../Selection/DictHandler", () => ({
  dictHandlers: {
    Bing: {
      apiFn: jest.fn(),
      reWord: () => "",
      toText: () => [],
    },
  },
}));

jest.mock("../Selection/DictCont", () => {
  const React = require("react");
  return function MockDictionary() {
    return React.createElement("div", null, "dictionary");
  };
});

jest.mock("../Selection/AiDictCont", () => {
  const React = require("react");
  return function MockAiDictionary() {
    return React.createElement("div", null, "ai dictionary");
  };
});

jest.mock("../Selection/SugCont", () => () => null);
jest.mock("../Selection/Zdic", () => () => null);

jest.mock("./DownloadButton", () => {
  const React = require("react");
  return function MockDownloadButton({ text }) {
    return React.createElement("button", { type: "button" }, text);
  };
});

jest.mock("./UploadButton", () => {
  const React = require("react");
  return function MockUploadButton({ text }) {
    return React.createElement("button", { type: "button" }, text);
  };
});

test("keeps every dictionary tab linked to a persistent panel", () => {
  useFavWords.mockReturnValue({
    favList: [["library", { definition: "n. collection" }]],
    wordList: ["library"],
    mergeWords: jest.fn(),
    clearWords: jest.fn(),
  });
  useSetting.mockReturnValue({
    setting: {
      transApis: [
        {
          apiSlug: "openai",
          apiName: "OpenAI",
          apiType: "OpenAI",
          dictPrompt: "Define the word",
        },
      ],
      prompts: [],
      subtitleSetting: {},
      tranboxSetting: {
        enDict: "Bing",
        enSug: "-",
        aiDictApiSlug: "openai",
        aiDictPromptSlug: PROMPT_MODE_FOLLOW_API,
        fromLang: "en",
        toLang: "zh-CN",
      },
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<FavWords />));
  act(() => container.querySelector(".MuiAccordionSummary-root").click());

  const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
  expect(tabs).toHaveLength(2);
  const panels = tabs.map((tab) =>
    document.getElementById(tab.getAttribute("aria-controls"))
  );
  expect(panels.every(Boolean)).toBe(true);
  expect(panels[0].getAttribute("aria-labelledby")).toBe(tabs[0].id);
  expect(panels[1].getAttribute("aria-labelledby")).toBe(tabs[1].id);
  expect(panels[0].hidden).toBe(false);
  expect(panels[1].hidden).toBe(true);

  act(() => tabs[1].click());
  expect(panels[0].hidden).toBe(true);
  expect(panels[1].hidden).toBe(false);

  act(() => root.unmount());
  container.remove();
});
