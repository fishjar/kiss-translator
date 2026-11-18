jest.mock("./common", () => ({ run: jest.fn() }));

const loadUserscript = () => {
  let common;
  jest.isolateModules(() => {
    require("./userscript");
    common = require("./common");
  });
  return common;
};

describe("userscript entry", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("starts the translator in HTML documents", () => {
    const { run } = loadUserscript();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(true);
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
      expect(() => require("./userscript")).not.toThrow();
    });
    expect(commonLoaded).toBe(false);
  });
});
