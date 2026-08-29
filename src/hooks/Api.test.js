import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
} from "../config";
import { useApiList } from "./Api";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockSetting;
const mockUpdateSetting = jest.fn();

jest.mock("./Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockUpdateSetting,
  }),
}));

function renderApiList() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const hookResult = {};

  function TestComponent() {
    Object.assign(hookResult, useApiList());
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    hookResult,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useApiList", () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    mockUpdateSetting.mockReset();
    mockSetting = { transApis: [] };
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn() },
    });
  });

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, "crypto", originalCrypto);
    } else {
      delete globalThis.crypto;
    }
  });

  test("does not append missing default APIs on mount", () => {
    const microsoft = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_MICROSOFT
    );
    mockSetting = { transApis: [microsoft] };

    const host = renderApiList();

    expect(host.hookResult.transApis).toEqual([microsoft]);
    expect(mockUpdateSetting).not.toHaveBeenCalled();
    host.unmount();
  });

  test("normalizes a missing model list URL without writing settings", () => {
    const openAi = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    const { modelListUrl, ...legacyOpenAi } = openAi;
    mockSetting = { transApis: [legacyOpenAi] };

    const host = renderApiList();

    expect(host.hookResult.transApis[0]).toEqual({
      ...legacyOpenAi,
      modelListUrl,
    });
    expect(mockUpdateSetting).not.toHaveBeenCalled();
    host.unmount();
  });

  test("adds an API from the default template only after user action", () => {
    globalThis.crypto.randomUUID
      .mockReturnValueOnce("12345678-1234-1234-1234-123456789abc")
      .mockReturnValueOnce("abcdefab-cdef-cdef-cdef-abcdefabcdef");
    const host = renderApiList();

    act(() => host.hookResult.addApi(OPT_TRANS_OPENAI));

    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    const update = mockUpdateSetting.mock.calls[0][0];
    const previous = { keep: true, transApis: [] };
    const next = update(previous);
    const template = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    expect(next).toEqual({
      ...previous,
      transApis: [
        {
          ...template,
          apiSlug: `${OPT_TRANS_OPENAI}_abcdefab-cdef-cdef-cdef-abcdefabcdef`,
          apiName: `${OPT_TRANS_OPENAI}_12345678`,
          apiType: OPT_TRANS_OPENAI,
        },
      ],
    });
    host.unmount();
  });

  test("deletes a default API without creating deletion markers", () => {
    const microsoft = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_MICROSOFT
    );
    const openAi = DEFAULT_API_LIST.find(
      (api) => api.apiType === OPT_TRANS_OPENAI
    );
    mockSetting = { transApis: [microsoft, openAi] };
    const host = renderApiList();

    act(() => host.hookResult.deleteApis([OPT_TRANS_MICROSOFT]));

    expect(mockUpdateSetting).toHaveBeenCalledTimes(1);
    const update = mockUpdateSetting.mock.calls[0][0];
    const previous = { keep: true, transApis: [microsoft, openAi] };
    const next = update(previous);
    expect(next).toEqual({ keep: true, transApis: [openAi] });
    expect(next).not.toHaveProperty("deletedTransApiSlugs");
    host.unmount();
  });
});
