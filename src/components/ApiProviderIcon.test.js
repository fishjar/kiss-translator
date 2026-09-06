/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import {
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_SILICONFLOW,
} from "../config";
import ApiProviderIcon, {
  getApiIconSrc,
  resolveApiIconPresentation,
} from "./ApiProviderIcon";

let mockIsGm = false;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/browser", () => ({ browser: undefined }));
jest.mock("../libs/client", () => ({
  get isGm() {
    return mockIsGm;
  },
}));

beforeEach(() => {
  mockIsGm = false;
});

function renderIcon(props, mode = "light") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ThemeProvider theme={createTheme({ palette: { mode } })}>
        <ApiProviderIcon {...props} />
      </ThemeProvider>
    );
  });

  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

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

  test("uses the bundled generic icon by default in a userscript", () => {
    mockIsGm = true;

    expect(getApiIconSrc(OPT_TRANS_GOOGLE, { runtime: undefined })).toBe("");
  });
});

describe("resolveApiIconPresentation", () => {
  test.each(["light", "dark"])(
    "keeps regular provider artwork unchanged on a light surface in %s mode",
    (mode) => {
      expect(
        resolveApiIconPresentation(OPT_TRANS_OPENAI, {
          mode,
          lightSurface: true,
        })
      ).toMatchObject({
        color: "#1F1F1F",
        filter: "none",
      });
    }
  );

  test.each(["light", "dark"])(
    "inverts the white ePhoneAI artwork on a light surface in %s mode",
    (mode) => {
      expect(
        resolveApiIconPresentation(OPT_TRANS_EPHONEAI, {
          mode,
          lightSurface: true,
        }).filter
      ).toBe("invert(100%)");
    }
  );

  test("preserves dark-mode inversion away from an explicit light surface", () => {
    expect(
      resolveApiIconPresentation(OPT_TRANS_OPENAI, { mode: "dark" }).filter
    ).toBe("invert(100%)");
  });

  test("uses a dark fallback foreground on an explicit light surface", () => {
    expect(
      resolveApiIconPresentation("unknown", { lightSurface: true }).color
    ).toBe("#1F1F1F");
  });

  test("enlarges only the undersized SiliconFlow artwork", () => {
    expect(resolveApiIconPresentation(OPT_TRANS_SILICONFLOW).scale).toBe(1.25);
    expect(resolveApiIconPresentation(OPT_TRANS_GOOGLE).scale).toBe(1);
  });
});

describe("ApiProviderIcon", () => {
  test("does not invert a regular provider image on a dark light-surface badge", () => {
    const view = renderIcon(
      { apiType: OPT_TRANS_OPENAI, lightSurface: true },
      "dark"
    );

    expect(getComputedStyle(view.container.querySelector("img")).filter).toBe(
      "none"
    );
    view.unmount();
  });

  test("gives the userscript fallback a dark foreground on a light surface", () => {
    mockIsGm = true;
    const view = renderIcon(
      { apiType: OPT_TRANS_GOOGLE, lightSurface: true },
      "dark"
    );

    expect(
      getComputedStyle(view.container.querySelector(".MuiSvgIcon-root")).color
    ).toBe("rgb(31, 31, 31)");
    view.unmount();
  });
});
