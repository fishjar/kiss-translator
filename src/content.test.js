const mockRun = jest.fn();
const mockGetURL = jest.fn();

jest.mock("./common", () => ({
  run: (...args) => mockRun(...args),
}));

jest.mock("./libs/browser", () => ({
  browser: {
    runtime: {
      getURL: (...args) => mockGetURL(...args),
    },
  },
  isExtensionContextInvalidatedError: (error) =>
    error?.message?.includes("Extension context invalidated") === true,
}));

describe("content runtime marker", () => {
  const marker = "__KISS_CONTENT_RUNTIME__chrome-extension://test-id/";
  const flushPromises = async () => {
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    jest.resetModules();
    mockRun.mockReset();
    mockGetURL.mockReset();
    mockGetURL.mockReturnValue("chrome-extension://test-id/");
    delete globalThis[marker];
  });

  afterEach(() => {
    delete globalThis[marker];
  });

  test("clears the marker after startup rejects", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockRun.mockRejectedValueOnce(new Error("startup failed"));

    require("./content");
    await flushPromises();

    expect(globalThis[marker]).toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  test("stores an identity and liveness probe in the marker", () => {
    mockRun.mockResolvedValueOnce();

    require("./content");

    expect(globalThis[marker]).toEqual(
      expect.objectContaining({
        dispose: expect.any(Function),
        identity: expect.any(Object),
        probe: expect.any(Function),
      })
    );
  });

  test("deduplicates injection while the existing runtime is alive", () => {
    mockRun.mockResolvedValueOnce();

    require("./content");
    const firstRuntime = globalThis[marker];
    jest.resetModules();
    require("./content");

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(globalThis[marker]).toBe(firstRuntime);
  });

  test("replaces a marker whose runtime context was invalidated", () => {
    mockRun.mockResolvedValue();

    require("./content");
    const oldRuntime = globalThis[marker];

    jest.resetModules();
    mockGetURL.mockReset();
    mockGetURL
      .mockReturnValueOnce("chrome-extension://test-id/")
      .mockImplementationOnce(() => {
        throw new Error("Extension context invalidated.");
      });
    require("./content");

    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(globalThis[marker]).not.toBe(oldRuntime);
  });

  test("stops a completed runtime before replacing its invalidated marker", async () => {
    const oldManager = { stop: jest.fn() };
    const newManager = { stop: jest.fn() };
    mockRun.mockResolvedValueOnce(oldManager).mockResolvedValueOnce(newManager);

    require("./content");
    await flushPromises();

    jest.resetModules();
    mockGetURL.mockReset();
    mockGetURL
      .mockReturnValueOnce("chrome-extension://test-id/")
      .mockImplementationOnce(() => {
        throw new Error("Extension context invalidated.");
      });
    require("./content");
    await flushPromises();

    expect(oldManager.stop).toHaveBeenCalledTimes(1);
    expect(newManager.stop).not.toHaveBeenCalled();
  });

  test("stops a late manager that resolves after its marker was replaced", async () => {
    let resolveOldStartup;
    const oldManager = { stop: jest.fn() };
    const newManager = { stop: jest.fn() };
    mockRun
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldStartup = resolve;
        })
      )
      .mockResolvedValueOnce(newManager);

    require("./content");
    jest.resetModules();
    mockGetURL.mockReset();
    mockGetURL
      .mockReturnValueOnce("chrome-extension://test-id/")
      .mockImplementationOnce(() => {
        throw new Error("Extension context invalidated.");
      });
    require("./content");
    const replacementRuntime = globalThis[marker];

    resolveOldStartup(oldManager);
    await flushPromises();

    expect(oldManager.stop).toHaveBeenCalledTimes(1);
    expect(newManager.stop).not.toHaveBeenCalled();
    expect(globalThis[marker]).toBe(replacementRuntime);
  });

  test("an old startup rejection cannot remove a replacement marker", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    let rejectOldStartup;
    const oldStartup = new Promise((resolve, reject) => {
      rejectOldStartup = reject;
    });
    mockRun.mockReturnValueOnce(oldStartup).mockResolvedValueOnce();

    require("./content");
    jest.resetModules();
    mockGetURL.mockReset();
    mockGetURL
      .mockReturnValueOnce("chrome-extension://test-id/")
      .mockImplementationOnce(() => {
        throw new Error("Extension context invalidated.");
      });
    require("./content");
    const replacementRuntime = globalThis[marker];

    rejectOldStartup(new Error("old startup failed"));
    await flushPromises();

    expect(globalThis[marker]).toBe(replacementRuntime);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  test("does not start when the extension context is already invalid", () => {
    mockGetURL.mockImplementationOnce(() => {
      throw new Error("Extension context invalidated.");
    });

    expect(() => require("./content")).not.toThrow();
    expect(mockRun).not.toHaveBeenCalled();
  });

  test("does not report an invalidated startup as an uncaught failure", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockRun.mockRejectedValueOnce(new Error("Extension context invalidated."));

    require("./content");
    await flushPromises();

    expect(globalThis[marker]).toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
