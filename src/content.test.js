jest.mock("./common", () => ({ run: jest.fn() }));

const loadContent = () => {
  let common;
  jest.isolateModules(() => {
    require("./content");
    common = require("./common");
  });
  return common;
};

describe("content entry", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.__KISS_CONTEXT__;
  });

  test("starts the translator in HTML documents", () => {
    const { run } = loadContent();
    expect(run).toHaveBeenCalledTimes(1);
    expect(globalThis.__KISS_CONTEXT__).toBe("content");
  });

  test("skips non-HTML documents without loading dependencies", () => {
    const xmlDoc = new DOMParser().parseFromString(
      "<root/>",
      "application/xml"
    );
    jest
      .spyOn(document, "createElement")
      .mockImplementation((tag) => xmlDoc.createElement(tag));

    let commonLoaded = false;
    jest.isolateModules(() => {
      jest.doMock("./common", () => {
        commonLoaded = true;
        return { run: jest.fn() };
      });
      expect(() => require("./content")).not.toThrow();
    });
    expect(commonLoaded).toBe(false);
    expect(globalThis.__KISS_CONTEXT__).toBeUndefined();
  });
});
