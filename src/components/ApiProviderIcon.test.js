import { OPT_TRANS_GOOGLE, OPT_TRANS_ORCAROUTER } from "../config";
import { getApiIconSrc } from "./ApiProviderIcon";

let mockIsGm = false;

jest.mock("../libs/browser", () => ({ browser: undefined }));
jest.mock("../libs/client", () => ({
  get isGm() {
    return mockIsGm;
  },
}));

describe("getApiIconSrc", () => {
  beforeEach(() => {
    mockIsGm = false;
  });

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

  test("uses the bundled generic icon by default in a userscript", () => {
    mockIsGm = true;

    expect(getApiIconSrc(OPT_TRANS_GOOGLE, { runtime: undefined })).toBe("");
  });
});
