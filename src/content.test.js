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
    document.body.innerHTML = "";
  });

  afterEach(() => {
    globalThis[marker]?.dispose?.();
    delete globalThis[marker];
    document.body.innerHTML = "";
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
    const activeHost = document.createElement("div");
    activeHost.id = "kiss-translator-fab";
    activeHost.setAttribute("data-kiss-translator-shadow-host", "");
    document.body.appendChild(activeHost);
    jest.resetModules();
    require("./content");

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(globalThis[marker]).toBe(firstRuntime);
    expect(activeHost.isConnected).toBe(true);
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

  test("ignores a forged replacement signal while the runtime is healthy", async () => {
    const manager = { stop: jest.fn() };
    mockRun.mockResolvedValueOnce(manager);

    require("./content");
    await flushPromises();
    const activeRuntime = globalThis[marker];

    document.dispatchEvent(new Event(`${marker}:replace`));

    expect(manager.stop).not.toHaveBeenCalled();
    expect(globalThis[marker]).toBe(activeRuntime);
  });

  test("stops the prior runtime through the shared DOM replacement signal", async () => {
    const oldManager = {
      stop: jest.fn(() => {
        throw new Error("Extension context invalidated.");
      }),
    };
    const newManager = { stop: jest.fn() };
    mockRun.mockResolvedValueOnce(oldManager);

    require("./content");
    await flushPromises();

    const staleHost = document.createElement("div");
    staleHost.id = "kiss-translator-fab";
    staleHost.className = "notranslate";
    const staleShadow = staleHost.attachShadow({ mode: "open" });
    const staleWrapper = document.createElement("div");
    staleWrapper.className = "kiss-translator-fab_wrapper notranslate";
    staleShadow.appendChild(staleWrapper);
    document.body.appendChild(staleHost);

    mockRun.mockImplementationOnce(() => {
      expect(staleHost.isConnected).toBe(false);
      const replacementHost = document.createElement("div");
      replacementHost.id = "kiss-translator-fab";
      replacementHost.setAttribute("data-kiss-translator-shadow-host", "");
      document.body.appendChild(replacementHost);
      return Promise.resolve(newManager);
    });

    // Extension updates create a fresh isolated world whose global marker cannot
    // see the old world, while both worlds still share the page DOM.
    delete globalThis[marker];
    jest.resetModules();
    mockGetURL.mockReset();
    mockGetURL
      .mockReturnValueOnce("chrome-extension://test-id/")
      .mockImplementationOnce(() => {
        throw new Error("Extension context invalidated.");
      })
      .mockReturnValue("chrome-extension://test-id/");
    require("./content");
    await flushPromises();

    expect(oldManager.stop).toHaveBeenCalledTimes(1);
    expect(newManager.stop).not.toHaveBeenCalled();
    expect(document.querySelectorAll("#kiss-translator-fab")).toHaveLength(1);
  });

  test("removes legacy KISS shadow hosts but preserves foreign ID collisions", () => {
    const staleBox = document.createElement("div");
    staleBox.id = "kiss-translator-box";
    staleBox.className = "notranslate";
    const staleBoxShadow = staleBox.attachShadow({ mode: "open" });
    const staleBoxWrapper = document.createElement("div");
    staleBoxWrapper.className = "kiss-translator-box_wrapper notranslate";
    staleBoxShadow.appendChild(staleBoxWrapper);

    const staleFab = document.createElement("div");
    staleFab.id = "kiss-translator-fab";
    staleFab.className = "notranslate";
    const staleFabShadow = staleFab.attachShadow({ mode: "open" });
    const staleFabWrapper = document.createElement("div");
    staleFabWrapper.className = "kiss-translator-fab_wrapper notranslate";
    staleFabShadow.appendChild(staleFabWrapper);

    const stalePopup = document.createElement("div");
    stalePopup.id = "kiss-translator-popup-1";
    stalePopup.className = "notranslate";
    const stalePopupShadow = stalePopup.attachShadow({ mode: "open" });
    const stalePopupWrapper = document.createElement("div");
    stalePopupWrapper.className = "kiss-translator-popup-1_wrapper notranslate";
    stalePopupShadow.appendChild(stalePopupWrapper);

    const foreignPopup = document.createElement("div");
    foreignPopup.id = "kiss-translator-popup";

    document.body.append(staleBox, staleFab, stalePopup, foreignPopup);
    mockRun.mockResolvedValueOnce();

    require("./content");

    expect(staleBox.isConnected).toBe(false);
    expect(staleFab.isConnected).toBe(false);
    expect(stalePopup.isConnected).toBe(false);
    expect(foreignPopup.isConnected).toBe(true);
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
