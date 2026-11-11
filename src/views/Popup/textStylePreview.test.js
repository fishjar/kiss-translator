// 断开 CustomStyles→Setting 的重依赖链：本套件只需 STYLE_SOURCE_CUSTOM 常量
jest.mock("../../hooks/CustomStyles", () => ({
  STYLE_SOURCE_CUSTOM: "custom",
}));

import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import {
  cachedCompileCss,
  previewCompileCache,
  PREVIEW_COMPILE_CACHE_LIMIT,
  textStyleOptionLabel,
  textStyleEntryPreview,
} from "./textStylePreview";

function renderNode(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const i18n = (key) => `i18n:${key}`;

// 沙箱激活锁：预览根盒必须脱离 inline 语境（contain:paint 对 inline 盒
// 不生效——弹窗入口为普通 block 容器，inline 预览曾致样式 CSS 裸奔）
// 装饰带预算锁：minHeight 32px 容得下行盒 16px + 下划装饰下探（underline
// offset 3.9px + 厚度至 2px + 波浪余量 2.5px 估算），居中带最紧行余量 2.6px
function expectSandboxBox(view) {
  const box = view.container.querySelector('span[aria-hidden="true"]');
  expect(box).toBeTruthy();
  expect(getComputedStyle(box).display).toBe("inline-flex");
  expect(getComputedStyle(box).contain).toContain("paint");
  expect(getComputedStyle(box).minHeight).toBe("32px");
  return box;
}

describe("textStylePreview compile cache", () => {
  beforeEach(() => {
    previewCompileCache.clear();
  });

  afterEach(() => {
    previewCompileCache.clear();
  });

  test("reuses the cached result for identical inputs", () => {
    const first = cachedCompileCss("kt-scope-a", "color: red");
    const second = cachedCompileCss("kt-scope-a", "color: red");
    expect(second).toBe(first);
    expect(previewCompileCache.size).toBe(1);
  });

  test("keeps distinct inputs apart with correct compiled output", () => {
    cachedCompileCss("kt-scope-a", "color: red");
    cachedCompileCss("kt-scope-a", "color: blue");
    expect(previewCompileCache.size).toBe(2);
    expect(previewCompileCache.get("kt-scope-a\u0000color: red")).toEqual({
      css: ".kt-scope-a .kt-style-demo { color: red }",
      valid: true,
    });
    // invalid 判定同样被缓存且键变即重编，语义与直连编译一致
    const invalid = cachedCompileCss("kt-scope-a", "&, body { color: red }");
    expect(invalid).toEqual({ css: "", valid: false });
    expect(
      previewCompileCache.get("kt-scope-a\u0000&, body { color: red }")
    ).toEqual({ css: "", valid: false });
  });

  test("bypasses the preview cache for non-string styleCode values", () => {
    // 非字符串 styleCode（导入可达）不构造缓存键：模板串会把数字 123 与
    // 字符串 "123" 折叠成同键——invalid 与 valid 的编译结果在缓存中错配。
    // 非字符串直连 compileCss（内部判 invalid）、不读写缓存
    previewCompileCache.clear();
    const nonString = cachedCompileCss("kt-scope-a", 123);
    expect(nonString).toEqual({ css: "", valid: false });
    expect(previewCompileCache.size).toBe(0);
    const str = cachedCompileCss("kt-scope-a", "123");
    expect(str.valid).toBe(true);
    expect(previewCompileCache.size).toBe(1);
    expect(cachedCompileCss("kt-scope-a", 123).valid).toBe(false);
    expect(previewCompileCache.size).toBe(1);
  });

  test("evicts the oldest entry beyond the limit (FIFO)", () => {
    expect(PREVIEW_COMPILE_CACHE_LIMIT).toBe(100);
    for (let i = 0; i < PREVIEW_COMPILE_CACHE_LIMIT; i += 1) {
      cachedCompileCss(`kt-scope-k${i}`, "color: red");
    }
    expect(previewCompileCache.size).toBe(PREVIEW_COMPILE_CACHE_LIMIT);
    const oldestKey = "kt-scope-k0\u0000color: red";
    expect(previewCompileCache.has(oldestKey)).toBe(true);

    cachedCompileCss("kt-scope-new", "color: red");
    expect(previewCompileCache.size).toBe(PREVIEW_COMPILE_CACHE_LIMIT);
    expect(previewCompileCache.has(oldestKey)).toBe(false);
  });
});

describe("textStyleOptionLabel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("builtin style renders the name plus PopupStylePreview with full code", () => {
    const view = renderNode(
      textStyleOptionLabel(
        {
          styleSlug: "testStyle",
          styleName: "Test Style",
          styleCode: "color: red",
          source: "builtin",
          isBuiltin: true,
        },
        i18n
      )
    );
    expect(view.container.textContent).toContain("Test Style");
    expect(view.container.textContent).toContain("i18n:translated_text");
    // 预览区不进可访问名称
    expect(
      view.container.querySelector('span[aria-hidden="true"]')
    ).toBeTruthy();
    expectSandboxBox(view);
    view.cleanup();
  });

  test("custom style with valid css renders the scoped compiled demo", () => {
    const view = renderNode(
      textStyleOptionLabel(
        {
          styleSlug: "custom_abc",
          styleName: "My Style",
          styleCode: "color: red",
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );
    const preview = view.container.querySelector('span[aria-hidden="true"]');
    expect(preview?.className).toContain("kt-scope-custom_abc");
    expect(view.container.querySelector(".kt-style-demo")).toBeTruthy();
    expect(view.container.querySelector("style")).toBeTruthy();
    expect(view.container.textContent).not.toContain("i18n:css_invalid");
    view.cleanup();
  });

  test("custom style with invalid css renders the css_invalid hint without style injection", () => {
    const view = renderNode(
      textStyleOptionLabel(
        {
          styleSlug: "custom_bad",
          styleName: "Bad Style",
          styleCode: "&, body { color: red }",
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );
    const preview = view.container.querySelector('span[aria-hidden="true"]');
    // 无效 CSS 不注入 <style>，仅保留 scope class 容器与显式提示
    expect(preview?.className).toContain("kt-scope-custom_bad");
    expect(view.container.querySelector("style")).toBeNull();
    expect(view.container.textContent).toContain("i18n:css_invalid");
    expect(view.container.querySelector(".kt-style-demo")).toBeNull();
    view.cleanup();
  });
});

describe("textStyleEntryPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("builtin style renders the preview-only demo without the name", () => {
    const view = renderNode(
      textStyleEntryPreview(
        {
          styleSlug: "testStyle",
          styleName: "Test Style",
          styleCode: "color: red",
          source: "builtin",
          isBuiltin: true,
        },
        i18n
      )
    );
    expect(view.container.textContent).toContain("i18n:translated_text");
    expect(view.container.textContent).not.toContain("Test Style");
    expectSandboxBox(view);
    view.cleanup();
  });

  test("custom style with valid css renders the scoped compiled demo", () => {
    const view = renderNode(
      textStyleEntryPreview(
        {
          styleSlug: "custom_abc",
          styleName: "My Style",
          styleCode: "color: red",
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );
    expect(
      view.container.querySelector(
        'span.kt-scope-custom_abc[aria-hidden="true"]'
      )
    ).toBeTruthy();
    expect(view.container.querySelector(".kt-style-demo")).toBeTruthy();
    expect(view.container.textContent).not.toContain("My Style");
    view.cleanup();
  });

  test("custom style with invalid css renders the css_invalid hint", () => {
    const view = renderNode(
      textStyleEntryPreview(
        {
          styleSlug: "custom_bad",
          styleName: "Bad Style",
          styleCode: "&, body { color: red }",
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );
    expect(view.container.textContent).toContain("i18n:css_invalid");
    view.cleanup();
  });
});
