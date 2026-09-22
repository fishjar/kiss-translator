/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import DictCont from "./DictCont";
import { useAsyncNow } from "../../hooks/Fetch";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Fetch", () => ({
  useAsyncNow: jest.fn(),
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
  return function MockFavoriteButton({ word }) {
    return React.createElement(
      "button",
      { type: "button", "data-favorite-word": word },
      "favorite"
    );
  };
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
