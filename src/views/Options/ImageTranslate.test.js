/**
 * @file ImageTranslate.test.js
 * @description 图片翻译选项页面单元测试。
 */
/* eslint-disable testing-library/no-unnecessary-act -- Tests use React DOM directly and require act for rendering and MUI interactions. */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ImageTranslate from "./ImageTranslate";
import { DEFAULT_IMAGE_TRANSLATE_SETTING } from "../../config/setting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdateSetting = jest.fn();
let mockSetting = {
  imageTranslateSetting: { ...DEFAULT_IMAGE_TRANSLATE_SETTING },
};

const mockPutRule = jest.fn();
let mockRules = [
  {
    pattern: "*",
    imageTransOpen: "true",
    imageMinWidth: 120,
    imageMinHeight: 80,
  },
];

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: (...args) => mockUpdateSetting(...args),
  }),
}));

jest.mock("../../hooks/Rules", () => ({
  useRules: () => ({
    list: mockRules,
    put: (...args) => mockPutRule(...args),
  }),
}));

const mockTransApis = [
  {
    apiSlug: "microsoft",
    apiName: "微软翻译",
    provider: { apiVersion: "1" },
    capabilities: ["translate"],
  },
  {
    apiSlug: "LocalAI-OCR",
    apiName: "LocalAI OCR",
    provider: { apiVersion: "1" },
    capabilities: ["recognizeText"],
    recognitionFeatures: {
      recognizeText: { coordinates: true },
    },
  },
  {
    apiSlug: "custom_vlm",
    apiName: "自定义 VLM",
    provider: { apiVersion: "1" },
    capabilities: ["parseImage"],
    recognitionFeatures: {
      parseImage: { coordinates: false },
    },
  },
  {
    apiSlug: "LocalAI-Layout",
    apiName: "LocalAI 版面分析",
    provider: { apiVersion: "1", implementation: { kind: "native" }, capabilities: { analyzeLayout: { coordinates: true } } },
  },
];

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [mockTransApis[0]],
    transApis: mockTransApis,
  }),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

describe("ImageTranslate Options Page", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockUpdateSetting.mockClear();
    mockPutRule.mockClear();
    mockSetting = {
      imageTranslateSetting: { ...DEFAULT_IMAGE_TRANSLATE_SETTING },
    };
    mockRules = [
      {
        pattern: "*",
        imageTransOpen: "true",
        imageMinWidth: 120,
        imageMinHeight: 80,
      },
    ];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("renders image translate options with default settings", () => {
    act(() => {
      root.render(<ImageTranslate />);
    });

    expect(container.textContent).toContain("翻译与语言");
    expect(container.textContent).toContain("图片识别与布局分析");
    expect(container.textContent).toContain("网页悬停与交互");
    expect(container.textContent).toContain("LocalAI OCR");
  });

  test("shows and saves the disabled layout choice and restores it when reopened", () => {
    const mountOptions = (layoutApiSlug) => {
      mockSetting = { imageTranslateSetting: { ...DEFAULT_IMAGE_TRANSLATE_SETTING, layoutApiSlug } };
      act(() => root.render(<ImageTranslate />));
    };
    const control = () => [...container.querySelectorAll(".MuiFormControl-root")].find((node) => node.querySelector("label")?.textContent === "界面分析服务");
    const select = () => control().querySelector(".MuiSelect-select");
    const choose = (value) => {
      act(() => select().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
      act(() => document.querySelector(`[role="option"][data-value="${value}"]`).click());
    };
    mountOptions("");
    expect(select().textContent).toBe("不使用布局服务 (整图识别)");
    expect(control().querySelector("label").getAttribute("data-shrink")).toBe("true");
    mountOptions("LocalAI-Layout");
    expect(select().textContent).toBe("LocalAI 版面分析");
    choose("");
    expect(mockUpdateSetting.mock.calls.slice(-1)[0][0](mockSetting)).toEqual({
      imageTranslateSetting: { ...DEFAULT_IMAGE_TRANSLATE_SETTING, layoutApiSlug: "" },
    });
    mountOptions("");
    expect(select().textContent).toBe("不使用布局服务 (整图识别)");
    act(() => root.render(null));
    mountOptions("");
    expect(select().textContent).toBe("不使用布局服务 (整图识别)");
    choose("LocalAI-Layout");
    expect(mockUpdateSetting.mock.calls.slice(-1)[0][0](mockSetting).imageTranslateSetting.layoutApiSlug).toBe("LocalAI-Layout");
    mountOptions("LocalAI-Layout");
    expect(select().textContent).toBe("LocalAI 版面分析");
  });

  test("allows toggling hover enablement and updates global rule", () => {
    act(() => {
      root.render(<ImageTranslate />);
    });

    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();

    act(() => {
      checkbox.click();
    });

    expect(mockPutRule).toHaveBeenCalledWith("*", { imageTransOpen: "false" });
  });

  test("allows modifying min width and min height on global rule", () => {
    act(() => {
      root.render(<ImageTranslate />);
    });

    const numberInputs = container.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBeGreaterThanOrEqual(2);

    const changeInput = (input, value) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    act(() => {
      changeInput(numberInputs[0], "200");
    });

    expect(mockPutRule).toHaveBeenCalledWith("*", { imageMinWidth: 200 });

    act(() => {
      changeInput(numberInputs[1], "150");
    });

    expect(mockPutRule).toHaveBeenCalledWith("*", { imageMinHeight: 150 });
  });
});
