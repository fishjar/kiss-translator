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

// 卸载注册表：断言中途失败跳过显式 cleanup 时，afterEach 兜底卸载仍会
// 执行（组件清理回调不因提前失败而丢失）
const mountedRoots = [];

function renderNode(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(node));
  return {
    container,
    cleanup() {
      act(() => root.unmount());
      const idx = mountedRoots.indexOf(root);
      if (idx !== -1) mountedRoots.splice(idx, 1);
      container.remove();
    },
  };
}

const i18n = (key) => `i18n:${key}`;

// 沙箱激活锁：预览根盒必须脱离 inline 语境（contain:paint 对 inline 盒
// 不生效——弹窗入口为普通 block 容器，inline 预览曾致样式 CSS 裸奔）
// 装饰带预算锁：块轴固定 32px 容得下行盒 16px + 下划装饰下探（underline
// offset 3.9px + 厚度至 2px + 波浪余量 2.5px 估算），居中带最紧行余量 2.6px。
// 块轴固定而非最小值：用户 CSS 的 line-height/font-size 不得撑高预览盒
// 进而撑爆 48px 菜单行或入口触发框，越缘内容由 contain:paint 裁剪
function expectSandboxBox(view) {
  const box = view.container.querySelector('span[aria-hidden="true"]');
  expect(box).toBeTruthy();
  expect(getComputedStyle(box).display).toBe("inline-flex");
  expect(getComputedStyle(box).contain).toContain("paint");
  expect(getComputedStyle(box).height).toBe("32px");
  // 负向锁：块轴不得回落为最小值形态（jsdom 对未设属性返回空串，
  // 断言 min-height 不再是 32px 最小驱动）
  expect(getComputedStyle(box).minHeight).not.toBe("32px");
  // 装饰带让位锁：预览盒以内容宽缘为 contain:paint 裁切边，text-shadow/
  // box-shadow 横向出血须经 padding 2px 6px + margin -2px -6px 负让位带
  // 承载（与样式卡 .kt-style-card__demo 同口径）——无让位带时内置辉光
  // 阴影横缘被切断，同一 styleCode 在卡内与下拉预览两貌漂移
  expect(getComputedStyle(box).paddingTop).toBe("2px");
  expect(getComputedStyle(box).paddingLeft).toBe("6px");
  expect(getComputedStyle(box).marginTop).toBe("-2px");
  expect(getComputedStyle(box).marginLeft).toBe("-6px");
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
      reason: undefined,
    });
    // invalid 判定同样被缓存且键变即重编，语义与直连编译一致；
    // reason 随编译结果缓存（选择器列表属作用域策略拒绝 → unsupported）
    const invalid = cachedCompileCss("kt-scope-a", "&, body { color: red }");
    expect(invalid).toEqual({
      css: "",
      valid: false,
      reason: "unsupported",
    });
    expect(
      previewCompileCache.get("kt-scope-a\u0000&, body { color: red }")
    ).toEqual({ css: "", valid: false, reason: "unsupported" });
  });

  test("bypasses the preview cache for non-string styleCode values", () => {
    // 非字符串 styleCode（导入可达）不构造缓存键：模板串会把数字 123 与
    // 字符串 "123" 折叠成同键——invalid 与 valid 的编译结果在缓存中错配。
    // 非字符串直连 compileCss（内部判 invalid）、不读写缓存
    previewCompileCache.clear();
    const nonString = cachedCompileCss("kt-scope-a", 123);
    expect(nonString).toEqual({
      css: "",
      valid: false,
      reason: "syntax",
    });
    expect(previewCompileCache.size).toBe(0);
    const str = cachedCompileCss("kt-scope-a", "123");
    expect(str.valid).toBe(true);
    expect(previewCompileCache.size).toBe(1);
    expect(cachedCompileCss("kt-scope-a", 123).valid).toBe(false);
    expect(previewCompileCache.size).toBe(1);
  });

  test("evicts the least recently used entry beyond the limit", () => {
    expect(PREVIEW_COMPILE_CACHE_LIMIT).toBe(100);
    for (let i = 0; i < PREVIEW_COMPILE_CACHE_LIMIT; i += 1) {
      cachedCompileCss(`kt-scope-k${i}`, "color: red");
    }
    expect(previewCompileCache.size).toBe(PREVIEW_COMPILE_CACHE_LIMIT);
    // 命中刷新最近使用权：再次访问最旧条目后，下一次淘汰必须牺牲未被
    // 访问的次旧条目——固定插入序淘汰会让活跃工作集在第 2 轮起整轮 miss
    cachedCompileCss("kt-scope-k0", "color: red");
    cachedCompileCss("kt-scope-new", "color: red");
    expect(previewCompileCache.size).toBe(PREVIEW_COMPILE_CACHE_LIMIT);
    expect(previewCompileCache.has("kt-scope-k0\u0000color: red")).toBe(true);
    expect(previewCompileCache.has("kt-scope-k1\u0000color: red")).toBe(false);
  });

  test("keeps the working set stable across repeated sweeps beyond the limit", () => {
    // 工作集稳定锁：上限内逐项反复访问后追加新条目，工作集成员不得被
    // 淘汰（驻留条目命中即续期，缓存容量恒有界）
    previewCompileCache.clear();
    for (let i = 0; i < PREVIEW_COMPILE_CACHE_LIMIT; i += 1) {
      cachedCompileCss(`kt-scope-w${i}`, "color: red");
    }
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < PREVIEW_COMPILE_CACHE_LIMIT; i += 1) {
        const result = cachedCompileCss(`kt-scope-w${i}`, "color: red");
        expect(result.valid).toBe(true);
      }
    }
    for (let i = 0; i < PREVIEW_COMPILE_CACHE_LIMIT; i += 1) {
      expect(previewCompileCache.has(`kt-scope-w${i}\u0000color: red`)).toBe(
        true
      );
    }
  });
});

describe("textStyleOptionLabel", () => {
  afterEach(() => {
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
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

  test("custom style with invalid css renders the hint outside the aria-hidden preview without style injection", () => {
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
    // 编译失败项以提示原位替换演示盒：aria-hidden 预览根不渲染，无样式
    // 文本不会被误认成样式的真实效果
    expect(preview).toBeNull();
    expect(view.container.querySelector("style")).toBeNull();
    // 选择器列表属作用域策略拒绝 → unsupported 文案
    expect(view.container.textContent).toContain("i18n:css_unsupported");
    expect(view.container.querySelector(".kt-style-demo")).toBeNull();
    // 提示不在 aria-hidden 祖先内：读屏必须可达编译失败状态
    const hint = view.container.querySelector(".kt-style-preview-hint");
    expect(hint).toBeTruthy();
    expect(hint.closest('[aria-hidden="true"]')).toBeNull();
    view.cleanup();
  });

  test("custom style with a syntax error keeps the css_invalid wording outside the aria-hidden preview", () => {
    const view = renderNode(
      textStyleOptionLabel(
        {
          styleSlug: "custom_err",
          styleName: "Err Style",
          styleCode: "& + { color: red }",
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );
    // 真语法错误（浏览器同样拒绝）保留 css_invalid 文案；提示同样读屏可达
    expect(view.container.textContent).toContain("i18n:css_invalid");
    const hint = view.container.querySelector(".kt-style-preview-hint");
    expect(hint.closest('[aria-hidden="true"]')).toBeNull();
    view.cleanup();
  });

  test("replaces the preview box with a wrappable hint when css is invalid", () => {
    // 提示原位替换演示盒且允许换行：窄菜单行中提示折行，名称列保持
    // ellipsis 让位口径不被挤压至不可见
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
    expect(view.container.querySelector('span[aria-hidden="true"]')).toBeNull();
    const hint = view.container.querySelector(".kt-style-preview-hint");
    expect(hint).toBeTruthy();
    expect(getComputedStyle(hint).whiteSpace).not.toBe("nowrap");
    view.cleanup();
  });

  test("caps the preview box at 45% beside the name column", () => {
    // 双栏行（名称左 + 预览右）：预览盒 45% 上限为名称列 ellipsis 让位
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
    const box = expectSandboxBox(view);
    expect(getComputedStyle(box).maxWidth).toBe("45%");
    view.cleanup();
  });
});

describe("textStyleEntryPreview", () => {
  afterEach(() => {
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
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

  test("unlocks the preview box width for the entry path (no name column)", () => {
    // 入口预览是唯一内容（无名称栏同框）：预览盒上限应放全宽（100%）；
    // 45% 是 option 双栏（名称左+预览右）的让位口径，入口复用即右侧空置
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
    const box = expectSandboxBox(view);
    expect(getComputedStyle(box).maxWidth).toBe("100%");
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

  test("custom style with invalid css renders the hint outside the aria-hidden preview", () => {
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
    expect(view.container.textContent).toContain("i18n:css_unsupported");
    const hint = view.container.querySelector(".kt-style-preview-hint");
    expect(hint.closest('[aria-hidden="true"]')).toBeNull();
    view.cleanup();
  });
});

describe("preview style remote url sanitization", () => {
  afterEach(() => {
    mountedRoots.forEach((root) => {
      act(() => root.unmount());
    });
    mountedRoots.length = 0;
    document.body.innerHTML = "";
    previewCompileCache.clear();
  });

  const renderCustomStyle = (styleCode) =>
    renderNode(
      textStyleOptionLabel(
        {
          styleSlug: "custom_net",
          styleName: "Net Style",
          styleCode,
          source: "custom",
          isBuiltin: false,
        },
        i18n
      )
    );

  test("strips remote url references from the injected preview css", () => {
    // 预览宿主注入面不可发起第三方网络请求：下拉未选项也真实渲染
    // <style>，远程图片/字体引用须在注入前清洗——ip/referer 泄露与
    // 跟踪像素落地面消除；compileCss 的 url 透传契约不受影响（清洗
    // 仅作用于预览口径）
    const view = renderCustomStyle(
      "color: red; background-image: url(https://tracker.example/pixel.png); list-style-image: url('http://cdn.example/font.svg')"
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).not.toContain("tracker.example");
    expect(styleTag.textContent).not.toContain("cdn.example");
    expect(styleTag.textContent).toContain("none");
    view.cleanup();
  });

  test("blocks escaped remote url spellings in the injected preview css", () => {
    // 反斜杠转义还原识别：url(\68ttps://…) 经反转义后仍是远程引用，同口径
    // 阻断，不留逃逸面
    const view = renderCustomStyle(
      "background-image: url(\\68 ttps://tracker.example/pixel.png)"
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).not.toContain("tracker.example");
    view.cleanup();
  });

  test("keeps data urls and relative references for offline previews", () => {
    // 非远程引用原样保留：data: 与相对路径不发起第三方请求，误杀即丢失
    // 离线装饰能力
    const view = renderCustomStyle(
      "background-image: url(data:image/png;base64,AAAA); list-style-image: url(./local.png)"
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).toContain("data:image/png;base64,AAAA");
    expect(styleTag.textContent).toContain("./local.png");
    view.cleanup();
  });

  test("strips remote references nested in image-set()", () => {
    // 嵌套资源函数须递归清洗：image-set 既接受 url() 也接受裸字符串 URL，
    // 两形在打开下拉时对未选项逐项发起第三方请求（协议仅管 script-src/
    // object-src，拦不住子资源）；外层匹配吞掉首个右括号会让内层 url()
    // 漏判，故须按括号配对递归 + 裸字符串同口径阻断
    const view = renderCustomStyle(
      'background-image: image-set(url(https://tracker.example/a.png) 1x, "https://tracker.example/b.png" 2x)'
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag.textContent).not.toContain("tracker.example");
    expect(styleTag.textContent).toContain("none");
    view.cleanup();
  });

  test("strips a remote url spelled with an escaped function name", () => {
    // 转义函数名 \75 rl( 解码后仍是 url(：命名逃逸不得留远程引用
    const view = renderCustomStyle(
      "background-image: \\75 rl(https://tracker.example/pixel.png)"
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag.textContent).not.toContain("tracker.example");
    expect(styleTag.textContent).toContain("none");
    view.cleanup();
  });

  test("does not rewrite url() text inside a quoted content value", () => {
    // 资源引用 vs 字面文本：content 字符串里的 url(...) 是普通文本，不得
    // 当远程资源清洗——误杀即改写用户可见文案
    const view = renderCustomStyle(
      'content: "url(https://example.invalid/x.png)"'
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag.textContent).toContain(
      "url(https://example.invalid/x.png)"
    );
    expect(styleTag.textContent).not.toContain("none");
    view.cleanup();
  });

  test("passes through pathologically deep nesting without crashing", () => {
    // 深度上限锁：合法 CSS 值嵌套远不及 32 层，超限整段原样透传（fail-
    // closed＝不清洗，与未识别形态同口径），杜绝病态深嵌套 styleCode 触发
    // 递归栈溢出崩渲染——预览对每个未选项都跑，一处抛错即整页样式库白屏
    const depth = 40;
    const deep =
      "background: " +
      "calc(".repeat(depth) +
      "url(https://tracker.example/x.png)" +
      ")".repeat(depth);
    const view = renderCustomStyle(deep);
    const styleTag = view.container.querySelector("style");
    // 渲染不抛错（style 注入在场）；超限段不清洗，远程引用按 fail-closed
    // 原样保留，换取不崩渲染
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).toContain("tracker.example");
    view.cleanup();
  });

  test("preserves whitespace between an at-rule keyword and its feature block", () => {
    // 函数 token 判定锁：CSS 词法中 ident 紧邻 ( 才构成函数 token；标识符与
    // 左括号之间的空白是媒体查询/条件组语法的一部分（and (min-width:…) 的
    // 特性块、@supports (display:grid)）。清洗器若把它折叠成 and(、@media(，
    // 浏览器按未知函数 token 处理、整条 at-rule 静默丢弃——预览里用户的响应
    // 式样式无声消失，而生产渲染路径不经清洗仍生效，同一 styleCode 两貌漂移
    const view = renderCustomStyle(
      "@media screen and (min-width: 100px) { & a { color: red } }"
    );
    const styleTag = view.container.querySelector("style");
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).toContain("screen and (min-width: 100px)");
    view.cleanup();
  });
});
