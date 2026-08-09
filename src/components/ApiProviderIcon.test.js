import { OPT_TRANS_GOOGLE, OPT_TRANS_ORCAROUTER } from "../config";
import { getApiIconSrc } from "./ApiProviderIcon";

jest.mock("../libs/browser", () => ({ browser: undefined }));

describe("getApiIconSrc", () => {
  test("uses the extension origin when a runtime is available", () => {
    const runtime = {
      getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
    };

    expect(getApiIconSrc(OPT_TRANS_GOOGLE, { runtime })).toBe(
      "chrome-extension://test-id/api/Google.svg"
    );
    expect(runtime.getURL).toHaveBeenCalledWith("api/Google.svg");
  });

  test("uses the public path outside an extension runtime", () => {
    expect(
      getApiIconSrc(OPT_TRANS_GOOGLE, {
        runtime: undefined,
        publicUrl: "/kiss-translator",
      })
    ).toBe("/kiss-translator/api/Google.svg");
  });

  test("resolves the OrcaRouter asset through the shared provider map", () => {
    expect(
      getApiIconSrc(OPT_TRANS_ORCAROUTER, {
        runtime: undefined,
        publicUrl: "/kiss-translator",
      })
    ).toBe("/kiss-translator/api/OrcaRouter.svg");
  });

  test("uses the public path by default for hosted userscript options", () => {
    const previousPublicUrl = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = "";

    try {
      expect(getApiIconSrc(OPT_TRANS_GOOGLE, { runtime: undefined })).toBe(
        "./api/Google.svg"
      );
    } finally {
      if (previousPublicUrl === undefined) {
        delete process.env.PUBLIC_URL;
      } else {
        process.env.PUBLIC_URL = previousPublicUrl;
      }
    }
  });
});
