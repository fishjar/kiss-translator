jest.mock("../client", () => ({ isGm: false }));

import {
  AIFW_MODULE_UNAVAILABLE,
  loadAifwModule,
  resolveAifwModuleUrl,
} from "./loader";

const client = require("../client");

const expectedWebUrl = () =>
  new URL("aifw-js/aifw-js.js", document.baseURI).href;

describe("resolveAifwModuleUrl", () => {
  beforeEach(() => {
    delete globalThis.chrome;
    client.isGm = false;
  });

  afterEach(() => {
    delete globalThis.chrome;
    client.isGm = false;
  });

  test("resolves the packaged module URL from the extension runtime", () => {
    const getURL = jest.fn((path) => `chrome-extension://test-id/${path}`);
    globalThis.chrome = { runtime: { getURL } };

    expect(resolveAifwModuleUrl()).toBe(
      "chrome-extension://test-id/aifw-js/aifw-js.js"
    );
    expect(getURL).toHaveBeenCalledWith("aifw-js/aifw-js.js");
  });

  test("resolves a site-relative URL for web builds", () => {
    expect(resolveAifwModuleUrl()).toBe(expectedWebUrl());
  });

  test("is unavailable for userscripts even when extension APIs exist", () => {
    client.isGm = true;
    globalThis.chrome = { runtime: { getURL: jest.fn() } };

    expect(resolveAifwModuleUrl()).toBeNull();
  });

  test("falls back to the web URL when chrome.runtime.getURL is missing", () => {
    globalThis.chrome = { runtime: {} };

    expect(resolveAifwModuleUrl()).toBe(expectedWebUrl());
  });

  test("is unavailable when the extension runtime cannot resolve the asset", () => {
    globalThis.chrome = {
      runtime: {
        getURL: jest.fn(() => {
          throw new Error("no access");
        }),
      },
    };

    expect(resolveAifwModuleUrl()).toBeNull();
  });
});

describe("loadAifwModule", () => {
  afterEach(() => {
    delete globalThis.chrome;
    client.isGm = false;
  });

  test("rejects with a typed error when the environment cannot load aifw-js", async () => {
    client.isGm = true;
    globalThis.chrome = { runtime: { getURL: jest.fn() } };

    await expect(loadAifwModule()).rejects.toMatchObject({
      code: AIFW_MODULE_UNAVAILABLE,
    });
  });
});
