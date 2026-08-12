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
  test("uses the existing toggle action when automatic collection is enabled", () => {
    const toggleFav = jest.fn();
    const handleChange = jest.fn();
    document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, handleChange);
    useFavWords.mockReturnValue({ favWords: {}, toggleFav });
    useSetting.mockReturnValue({
      context: "tranbox",
      setting: { tranboxSetting: { autoFavWord: true } },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(<FavBtn word="library" title="collect" />);
    });

    expect(toggleFav).toHaveBeenCalledWith("library");
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
    (wasFavorite, isFavorite) => {
      const toggleFav = jest.fn();
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
      act(() => container.querySelector("button").click());

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
});
