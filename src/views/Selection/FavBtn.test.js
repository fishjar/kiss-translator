import { act } from "react";
import { createRoot } from "react-dom/client";
import FavBtn from "./FavBtn";
import { useFavWords } from "../../hooks/FavWords";
import { useSetting } from "../../hooks/Setting";
import { EVENT_FAVORITE_WORD_CHANGE } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/FavWords", () => ({ useFavWords: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));

describe("FavBtn", () => {
  test("uses an additive edit when automatic collection is enabled", async () => {
    const toggleFav = jest.fn();
    const mergeWords = jest.fn().mockResolvedValue({ value: { library: {} } });
    const handleChange = jest.fn();
    document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
    useFavWords.mockReturnValue({ favWords: {}, toggleFav, mergeWords });
    useSetting.mockReturnValue({
      context: "tranbox",
      setting: { tranboxSetting: { autoFavWord: true } },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<FavBtn word="library" title="collect" />);
    });

    expect(mergeWords).toHaveBeenCalledWith(["library"]);
    expect(toggleFav).not.toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { word: "library", isFavorite: true },
      })
    );

    act(() => root.unmount());
    document.removeEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
  });

  test("does not toggle an already collected word automatically", () => {
    const toggleFav = jest.fn();
    useFavWords.mockReturnValue({
      favWords: { library: { createdAt: 1 } },
      toggleFav,
    });
    useSetting.mockReturnValue({
      context: "tranbox",
      setting: { tranboxSetting: { autoFavWord: true } },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(<FavBtn word="library" title="collect" />);
    });

    expect(toggleFav).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test.each([
    [false, true],
    [true, false],
  ])(
    "notifies the current page when manual favorite state changes from %s",
    async (wasFavorite, isFavorite) => {
      const toggleFav = jest
        .fn()
        .mockResolvedValue({ value: isFavorite ? { library: {} } : {} });
      const handleChange = jest.fn();
      document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
      useFavWords.mockReturnValue({
        favWords: wasFavorite ? { library: { createdAt: 1 } } : {},
        toggleFav,
      });
      useSetting.mockReturnValue({
        context: "tranbox",
        setting: { tranboxSetting: { autoFavWord: false } },
      });
      const container = document.createElement("div");
      const root = createRoot(container);

      act(() => {
        root.render(<FavBtn word="library" title="collect" />);
      });
      const button = container.querySelector("button");
      expect(button.getAttribute("aria-label")).toBe("collect");
      expect(button.getAttribute("aria-pressed")).toBe(String(wasFavorite));
      await act(async () => button.click());

      expect(toggleFav).toHaveBeenCalledWith("library");
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { word: "library", isFavorite },
        })
      );

      act(() => root.unmount());
      document.removeEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
    }
  );

  test.each([true, false])(
    "waits for storage before notifying and releasing the button (success=%s)",
    async (success) => {
      let resolve;
      let reject;
      const write = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      const toggleFav = jest.fn(() => write);
      const handleChange = jest.fn();
      document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
      useFavWords.mockReturnValue({ favWords: {}, toggleFav });
      useSetting.mockReturnValue({ context: "tranbox", setting: {} });
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<FavBtn word="library" title="collect" />));
      const button = container.querySelector("button");
      act(() => {
        button.click();
        button.click();
      });
      expect(toggleFav).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(true);
      expect(handleChange).not.toHaveBeenCalled();
      await act(async () => {
        if (success) resolve({ value: { library: {} } });
        else reject(new Error("storage unavailable"));
      });
      expect(button.disabled).toBe(false);
      expect(handleChange).toHaveBeenCalledTimes(success ? 1 : 0);
      act(() => root.unmount());
      document.removeEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
    }
  );
});
