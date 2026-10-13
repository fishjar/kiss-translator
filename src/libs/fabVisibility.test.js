import { isFabHiddenOnPage } from "./fabVisibility";

describe("FAB page visibility", () => {
  test.each([false, true])(
    "keeps the global preference %s outside exceptions",
    (isHide) => {
      expect(
        isFabHiddenOnPage(
          { isHide, hideExceptionList: "https://other.example/*" },
          "https://example.com/article"
        )
      ).toBe(isHide);
    }
  );

  test.each([false, true])(
    "inverts the global preference %s for a matching page",
    (isHide) => {
      const config = {
        isHide,
        hideExceptionList: "https://other.example/*,\n https://example.com/*",
      };
      expect(isFabHiddenOnPage(config, "https://example.com/article")).toBe(
        !isHide
      );
      expect(config.isHide).toBe(isHide);
    }
  );

  test("shows the FAB when a legacy configuration has no hide preference", () => {
    expect(isFabHiddenOnPage(undefined, "https://example.com/")).toBe(false);
    expect(isFabHiddenOnPage({}, "https://example.com/")).toBe(false);
  });
});
