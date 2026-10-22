/**
 * @file ImageTranslate.test.js
 * @description 网页图片翻译视图组件单元测试。
 */
/* eslint-disable testing-library/no-unnecessary-act -- These tests use React DOM directly, which requires act. */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import DualActionButton from "./DualActionButton";
import ImageTranslateContent from "./ImageTranslateContent";
import ImageTranslateHeader from "./ImageTranslateHeader";
import ImageLayoutOverlay from "./ImageLayoutOverlay";
import { newI18n } from "../../config/i18n";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("DualActionButton", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("renders menu, layout, and translate buttons and dispatches clicks", () => {
    const onMenuClick = jest.fn();
    const onLayoutClick = jest.fn();
    const onTranslateClick = jest.fn();

    act(() => {
      root.render(
        <DualActionButton
          visible={true}
          onMenuClick={onMenuClick}
          onLayoutClick={onLayoutClick}
          onTranslateClick={onTranslateClick}
        />
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);

    act(() => {
      buttons[0].click();
    });
    expect(onMenuClick).toHaveBeenCalledTimes(1);

    act(() => {
      buttons[1].click();
    });
    expect(onLayoutClick).toHaveBeenCalledWith("start");

    act(() => {
      buttons[2].click();
    });
    expect(onTranslateClick).toHaveBeenCalledTimes(1);
  });

  test("renders cancel button when onCancelClick provided", () => {
    const onCancelClick = jest.fn();
    act(() => {
      root.render(
        <DualActionButton visible={true} onCancelClick={onCancelClick} />
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(4); // Menu, Layout, Translate, Cancel

    act(() => {
      buttons[3].click();
    });
    expect(onCancelClick).toHaveBeenCalledTimes(1);
  });

  test("handles layout multi-state clicks (cancel & toggle)", () => {
    const onLayoutClick = jest.fn();

    // 1. Loading 态点击取消
    act(() => {
      root.render(
        <DualActionButton
          visible={true}
          layoutState="loading"
          onLayoutClick={onLayoutClick}
        />
      );
    });
    const loadingBtn = container.querySelectorAll("button")[1];
    act(() => {
      loadingBtn.click();
    });
    expect(onLayoutClick).toHaveBeenLastCalledWith("cancel");

    // 2. Active 态点击切换显示/隐藏
    act(() => {
      root.render(
        <DualActionButton
          visible={true}
          layoutState="active"
          showLayoutOverlay={true}
          onLayoutClick={onLayoutClick}
        />
      );
    });
    const activeBtn = container.querySelectorAll("button")[1];
    act(() => {
      activeBtn.click();
    });
    expect(onLayoutClick).toHaveBeenLastCalledWith("toggle");
  });

  test("does not render when visible is false", () => {
    act(() => {
      root.render(<DualActionButton visible={false} />);
    });
    expect(container.firstChild).toBeNull();
  });
});

describe("ImageLayoutOverlay", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("renders interactive polygons and toggles region on click", () => {
    const onToggleRegion = jest.fn();
    const sampleRegions = [
      {
        bbox: [10, 10, 100, 50],
        polygon: [
          [10, 10],
          [100, 10],
          [100, 50],
          [10, 50],
        ],
        enabled: true,
      },
    ];

    act(() => {
      root.render(
        <ImageLayoutOverlay
          regions={sampleRegions}
          imageRect={{ left: 0, top: 0, width: 200, height: 100 }}
          naturalWidth={200}
          naturalHeight={100}
          onToggleRegion={onToggleRegion}
        />
      );
    });

    const polygon = container.querySelector("polygon");
    expect(polygon).not.toBeNull();

    act(() => {
      polygon
        .closest("g")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleRegion).toHaveBeenCalledWith(0);
  });
});

describe("ImageTranslateContent", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const sampleItems = [
    { original: "Hello world", translation: "你好世界" },
    { original: "Image translation", translation: "图片翻译" },
  ];

  test("renders bilingual segments by default", () => {
    act(() => {
      root.render(
        <ImageTranslateContent items={sampleItems} viewMode="bilingual" />
      );
    });

    expect(container.textContent).toContain("Hello world");
    expect(container.textContent).toContain("你好世界");
    expect(container.textContent).toContain("Image translation");
    expect(container.textContent).toContain("图片翻译");
  });

  test("shows failed recognition region numbers without discarding successful translations", () => {
    act(() =>
      root.render(
        <ImageTranslateContent
          items={sampleItems}
          recognitionErrors={[
            { order: 2, error: "RPC timed out" },
            { order: 3, error: "empty output" },
          ]}
        />
      )
    );
    expect(container.textContent).toContain("部分分区识别失败");
    expect(container.textContent).toContain("#3: RPC timed out");
    expect(container.textContent).toContain("#4: empty output");
    expect(container.textContent).toContain("你好世界");
    expect(container.textContent).toContain("图片翻译");
  });

  test("renders prompt to start translation when configured but idle", () => {
    act(() => {
      root.render(
        <ImageTranslateContent
          items={[]}
          hasRecognitionService={true}
          hasExecuted={false}
        />
      );
    });

    expect(container.textContent).toContain("点击上方「翻译」开始识别与翻译");
  });

  test("renders prompt when recognition service is not configured", () => {
    act(() => {
      root.render(
        <ImageTranslateContent
          items={[]}
          hasRecognitionService={false}
          hasExecuted={false}
        />
      );
    });

    expect(container.textContent).toContain("未配置识别服务");
  });

  test("renders no text detected after execution with empty items", () => {
    act(() => {
      root.render(
        <ImageTranslateContent
          items={[]}
          hasRecognitionService={true}
          hasExecuted={true}
        />
      );
    });

    expect(container.textContent).toContain("未在图片中识别到文本");
  });

  test("renders error message and retry button when error occurs", () => {
    const onRetry = jest.fn();
    act(() => {
      root.render(
        <ImageTranslateContent
          items={[]}
          error="Network error"
          onRetry={onRetry}
        />
      );
    });

    expect(container.textContent).toContain("Network error");
    const buttons = Array.from(container.querySelectorAll("button"));
    const retryBtn = buttons.find((btn) => btn.textContent.includes("重试"));
    expect(retryBtn).not.toBeNull();
    act(() => {
      retryBtn.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("renders item-level error message and retry button when single segment translation fails", () => {
    const onRetryItem = jest.fn();
    const itemsWithError = [
      { original: "Item success", translation: "项目成功" },
      {
        original: "Item failed",
        translation: "",
        error: "Rate limit exceeded",
      },
    ];

    act(() => {
      root.render(
        <ImageTranslateContent
          items={itemsWithError}
          hasExecuted={true}
          onRetryItem={onRetryItem}
        />
      );
    });

    expect(container.textContent).toContain("Item failed");
    expect(container.textContent).toContain("Rate limit exceeded");
    const buttons = Array.from(container.querySelectorAll("button"));
    const retryItemBtn = buttons.find((btn) =>
      btn.textContent.includes("重试")
    );
    expect(retryItemBtn).not.toBeNull();
    act(() => {
      retryItemBtn.click();
    });
    expect(onRetryItem).toHaveBeenCalledWith(1);
  });
});

describe("ImageTranslateHeader", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("localizes recognition controls without mounting the file translation page", () => {
    act(() => root.render(<ImageTranslateHeader i18n={newI18n("en")} />));
    const labels = [...container.querySelectorAll("label")].map(
      (label) => label.textContent
    );
    expect(labels).toContain("Text Recognition");
    expect(labels).not.toContain("文本识别");
  });

  test("renders header with action buttons and two-row controls", () => {
    const onRunAction = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <ImageTranslateHeader
          scene={{
            fromLang: "auto",
            toLang: "zh-CN",
            recognitionService: {
              apiSlug: "mock_ocr",
              capability: "recognizeText",
            },
          }}
          apis={[
            {
              apiSlug: "mock_ocr",
              apiName: "Mock OCR",
              provider: { apiVersion: "1" },
              capabilities: ["recognizeText"],
            },
          ]}
          onRunAction={onRunAction}
          onClose={onClose}
        />
      );
    });

    expect(container.textContent).toContain("图片翻译");
    const translateBtn = container.querySelector("button");
    expect(translateBtn).not.toBeNull();
  });

  test("disables select controls when busy is true", () => {
    act(() => {
      root.render(
        <ImageTranslateHeader
          scene={{
            fromLang: "auto",
            toLang: "zh-CN",
            recognitionService: {
              apiSlug: "mock_ocr",
              capability: "recognizeText",
            },
          }}
          apis={[
            {
              apiSlug: "mock_ocr",
              apiName: "Mock OCR",
              provider: { apiVersion: "1" },
              capabilities: ["recognizeText"],
            },
          ]}
          busy={true}
          stage="translating"
        />
      );
    });

    const selects = container.querySelectorAll(".MuiSelect-select");
    expect(selects.length).toBeGreaterThan(0);
    // MUI Select with disabled=true has aria-disabled="true" or has Mui-disabled class on parent
    selects.forEach((select) => {
      const isDisabled =
        select.getAttribute("aria-disabled") === "true" ||
        select.classList.contains("Mui-disabled") ||
        select.closest(".Mui-disabled") !== null;
      expect(isDisabled).toBe(true);
    });
  });

  test("displays the disabled layout choice initially, after selecting it, and after reopening", () => {
    const onSettingChange = jest.fn();
    const apis = [
      {
        apiSlug: "layout",
        apiName: "Layout service",
        provider: {
          apiVersion: "1",
          implementation: { kind: "native" },
          capabilities: { analyzeLayout: { coordinates: true } },
        },
      },
    ];
    const mountHeader = (layoutApiSlug) =>
      act(() =>
        root.render(
          <ImageTranslateHeader
            scene={{ layoutApiSlug }}
            apis={apis}
            onSettingChange={onSettingChange}
          />
        )
      );
    const control = () =>
      [...container.querySelectorAll(".MuiFormControl-root")].find(
        (node) => node.querySelector("label")?.textContent === "布局分析"
      );
    const select = () => control().querySelector(".MuiSelect-select");
    const choose = (value) => {
      act(() =>
        select().dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
      );
      act(() =>
        container
          .querySelector(`[role="option"][data-value="${value}"]`)
          .click()
      );
    };
    mountHeader("");
    expect(select().textContent).toBe("不启用");
    expect(control().querySelector("label").getAttribute("data-shrink")).toBe(
      "true"
    );
    mountHeader("layout");
    expect(select().textContent).toBe("Layout service");
    choose("");
    expect(onSettingChange).toHaveBeenLastCalledWith({ layoutApiSlug: "" });
    mountHeader("");
    expect(select().textContent).toBe("不启用");
    act(() => root.render(null));
    mountHeader("");
    expect(select().textContent).toBe("不启用");
    choose("layout");
    expect(onSettingChange).toHaveBeenLastCalledWith({
      layoutApiSlug: "layout",
    });
    mountHeader("layout");
    expect(select().textContent).toBe("Layout service");
  });

  test("offers separate layout, recognition, and translation actions", () => {
    const onRunAction = jest.fn();
    const renderHeader = () =>
      root.render(
        <ImageTranslateHeader
          scene={{
            layoutApiSlug: "layout",
            recognitionService: { apiSlug: "ocr", capability: "recognizeText" },
          }}
          apis={[
            {
              apiSlug: "layout",
              provider: {
                apiVersion: "1",
                implementation: { kind: "native" },
                capabilities: { analyzeLayout: { coordinates: true } },
              },
            },
          ]}
          onRunAction={onRunAction}
          hasRecognizedText
        />
      );
    act(renderHeader);
    const openMenu = () => {
      const button = container.querySelector(
        '[aria-label="select merge action"]'
      );
      button.getBoundingClientRect = () => ({
        top: 10,
        left: 10,
        bottom: 40,
        right: 40,
        width: 30,
        height: 30,
      });
      act(() => button.click());
    };
    openMenu();
    let actions = container.querySelectorAll('[role="menu"] [role="menuitem"]');
    expect(Array.from(actions, (item) => item.textContent)).toEqual([
      "布局分析",
      "文本识别",
      "文本翻译",
    ]);
    act(() => actions[0].click());
    expect(onRunAction).toHaveBeenLastCalledWith("layout");
    openMenu();
    actions = container.querySelectorAll('[role="menu"] [role="menuitem"]');
    act(() => actions[1].click());
    expect(onRunAction).toHaveBeenLastCalledWith("recognize");
  });

  test("does not render a VLM prompt select when VLM recognition service is active", () => {
    act(() => {
      root.render(
        <ImageTranslateHeader
          scene={{
            fromLang: "auto",
            toLang: "zh-CN",
            recognitionService: {
              apiSlug: "mock_vlm",
              capability: "parseImage",
            },
          }}
          apis={[
            {
              apiSlug: "mock_vlm",
              apiName: "Mock VLM",
              provider: { apiVersion: "1" },
              capabilities: ["parseImage"],
            },
          ]}
          prompts={[
            {
              slug: "vlm-prompt-1",
              name: "Custom VLM Prompt",
              category: "vlm prompt",
            },
          ]}
        />
      );
    });

    expect(container.textContent).not.toContain("VLM 提示词");
  });
});
