import { act } from "react";
import { createRoot } from "react-dom/client";
import FavBtn from "./FavBtn";
import { useFavWords } from "../../hooks/FavWords";
import { useSetting } from "../../hooks/Setting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/FavWords", () => ({ useFavWords: jest.fn() }));
jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));

describe("FavBtn", () => {
  test("uses the existing toggle action when automatic collection is enabled", () => {
    const toggleFav = jest.fn();
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

    act(() => root.unmount());
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
});
