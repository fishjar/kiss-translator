import fs from "fs";
import path from "path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import SubtitleSetting, { parseCssToObject, objectToCss } from "./Subtitle";
import { useSubtitle } from "../../hooks/Subtitle";
import { I18N, UI_LANGS, DEFAULT_SUBTITLE_SETTING } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Subtitle", () => ({
  useSubtitle: jest.fn(),
}));

jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({ enabledApis: [], aiEnabledApis: [] }),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));

jest.mock("../../hooks/ValidationInput", () => () => null);

function renderSubtitle(overrides = {}) {
  const updateSubtitle = jest.fn();
  useSubtitle.mockReturnValue({
    subtitleSetting: {
      ...DEFAULT_SUBTITLE_SETTING,
      // showLoadNotification 不在 DEFAULT_SUBTITLE_SETTING 里，
      // 它的默认值只存在于 Subtitle.js 的解构默认值中。
      enhanceMode: "desktop",
      ...overrides,
    },
    updateSubtitle,
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<SubtitleSetting />);
  });

  return {
    container,
    updateSubtitle,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function setSliderValue(input, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(input, String(value));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Subtitle style editor layout", () => {
  test("preserves the spaced grid gutters inside its stack", () => {
    const view = renderSubtitle();
    const sourceTitle = Array.from(
      view.container.querySelectorAll(".MuiTypography-subtitle2")
    ).find((element) => element.textContent === "origin_styles");
    const grid = sourceTitle.closest(".MuiGrid-item").parentElement;
    const stack = grid.parentElement;

    expect(window.getComputedStyle(stack).gap).toBe("16px");
    expect(window.getComputedStyle(grid).marginLeft).toBe("-16px");
    expect(window.getComputedStyle(grid).marginTop).toBe("-16px");

    view.unmount();
  });

  test("names every slider and color input without relying on adjacent text", () => {
    const view = renderSubtitle();
    const sliderNames = Array.from(
      view.container.querySelectorAll('.MuiSlider-root input[type="range"]')
    ).map((input) => input.getAttribute("aria-label"));
    expect(sliderNames).toEqual([
      "origin_styles font_size",
      "translation_styles font_size",
      "opacity",
      "line_height",
      "padding vertical",
      "padding horizontal",
    ]);

    const colorInputs = Array.from(
      view.container.querySelectorAll('input[type="color"]')
    );
    expect(
      colorInputs.map((input) => input.getAttribute("aria-label"))
    ).toEqual([
      "origin_styles font_color",
      "translation_styles font_color",
      "background_color",
    ]);
    expect(
      colorInputs.every((input) => getComputedStyle(input).width === "48px")
    ).toBe(true);
    view.unmount();
  });
});

describe("Subtitle style persistence", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // 本文件里没有任何 onChangeCommitted，200ms 防抖是样式改动唯一的持久化路径。
  // 卸载时若直接 clearTimeout 而不 flush，「拖完滑块立刻切走」的改动就没了。
  test("flushes a pending style write when the page unmounts", () => {
    jest.useFakeTimers();
    const view = renderSubtitle();
    const slider = view.container.querySelector(".MuiSlider-root input");
    expect(slider).not.toBeNull();

    setSliderValue(slider, 24);
    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(view.updateSubtitle).not.toHaveBeenCalled();

    view.unmount();

    expect(view.updateSubtitle).toHaveBeenCalledTimes(1);
  });

  test("coalesces rapid style edits into a single write", () => {
    jest.useFakeTimers();
    const view = renderSubtitle();
    const slider = view.container.querySelector(".MuiSlider-root input");

    setSliderValue(slider, 20);
    setSliderValue(slider, 22);
    setSliderValue(slider, 24);

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(view.updateSubtitle).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(view.updateSubtitle).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});

describe("Subtitle segmentation warning", () => {
  // 三向门控：只有在强制重翻译、启用了 AI 断句、且断句服务与翻译服务不同时才警告。
  // 这条文案的历史值得留意：b436d5b 加入，a07d39f 删除，1b10d45 有意恢复。
  const warned = (overrides) => {
    const view = renderSubtitle(overrides);
    const hit = view.container.textContent.includes("seg_trans_diff_warning");
    view.unmount();
    return hit;
  };

  test("warns only when the segmentation service differs from the translator", () => {
    expect(
      warned({
        forceSubtitleRetranslate: true,
        segSlug: "openai",
        apiSlug: "microsoft",
      })
    ).toBe(true);
  });

  test.each([
    [
      "retranslation is off",
      {
        forceSubtitleRetranslate: false,
        segSlug: "openai",
        apiSlug: "microsoft",
      },
    ],
    [
      "AI segmentation is disabled",
      { forceSubtitleRetranslate: true, segSlug: "-", apiSlug: "microsoft" },
    ],
    [
      "both services match",
      { forceSubtitleRetranslate: true, segSlug: "openai", apiSlug: "openai" },
    ],
  ])("stays silent when %s", (_case, overrides) => {
    expect(warned(overrides)).toBe(false);
  });
});

describe("Subtitle CSS round-trip", () => {
  // 拖动任意样式滑块都会把整块 CSS 经 parse -> object -> serialize 重写一遍。
  // 分号会合法地出现在引号、括号和注释内部，裸 split(";") 会把值拦腰截断，
  // 而截断结果会被写回存储，无法恢复。这是上游 dev 上就存在的问题，不是本分支引入的。
  const roundTrip = (css) => objectToCss(parseCssToObject(css));
  const normalize = (css) => css.trim().replace(/;$/, "");

  test.each([
    [
      "the shipped window default",
      `padding: 0.5em 1em;
background-color: rgba(0, 0, 0, 0.5);
color: white;
line-height: 1.3;
text-shadow: 1px 1px 2px black;
display: inline-block`,
    ],
    ["the shipped origin default", `font-size: clamp(1rem, 2cqw, 3rem);`],
    [
      "a data URI containing semicolons",
      `background-image: url("data:image/svg+xml;utf8,<svg/>");
color: white;`,
    ],
    [
      "a comment containing a semicolon",
      `/* a;b */
color: red;`,
    ],
    [
      "nested parentheses and quotes",
      `background: linear-gradient(90deg, rgba(0,0,0,.5), url("a;b"));
color: red;`,
    ],
    [
      "a single-quoted value",
      `content: 'a;b';
color: red;`,
    ],
  ])("survives %s", (_case, css) => {
    expect(normalize(roundTrip(css))).toBe(normalize(css));
  });

  test("keeps an edited property without shredding its siblings", () => {
    const css = `background-image: url("data:image/svg+xml;utf8,<svg/>");
font-size: 2rem;`;
    const parsed = parseCssToObject(css);
    parsed["font-size"] = "2.5rem";

    const next = objectToCss(parsed);
    expect(next).toContain(`url("data:image/svg+xml;utf8,<svg/>")`);
    expect(next).toContain("font-size: 2.5rem");
  });

  describe.each([
    ["an escaped double quote", String.raw`"a\";b"`],
    ["an escaped single quote", String.raw`'a\';b'`],
    ["an odd backslash run before a double quote", String.raw`"a\\\";b"`],
    ["an odd backslash run before a single quote", String.raw`'a\\\';b'`],
    ["an even backslash run before a closing double quote", String.raw`"a\\"`],
    [
      "an even backslash run before a closing single quote",
      String.raw`'a\\\\'`,
    ],
  ])("with %s", (_case, content) => {
    const css = `content: ${content};\nfont-size: 2rem;\ntext-shadow: 1px 1px black;\ncolor: white;`;

    test("parses each following declaration separately", () => {
      expect(parseCssToObject(css)).toEqual({
        content,
        "font-size": "2rem",
        "text-shadow": "1px 1px black",
        color: "white",
      });
    });

    test("updates a following declaration without changing the quoted value", () => {
      const parsed = parseCssToObject(css);
      parsed["font-size"] = "2.5rem";

      expect(objectToCss(parsed)).toBe(
        `content: ${content};\nfont-size: 2.5rem;\ntext-shadow: 1px 1px black;\ncolor: white;`
      );
    });

    test("removes a following declaration without changing its neighbors", () => {
      const parsed = parseCssToObject(css);
      delete parsed["text-shadow"];

      expect(objectToCss(parsed)).toBe(
        `content: ${content};\nfont-size: 2rem;\ncolor: white;`
      );
    });
  });
});

describe("Subtitle advanced controls", () => {
  // 2e45756 的两条房规：Grid container 必须是折叠内容的直接子节点（用 Fragment
  // 而不是 Box 包一层），且项目已全局删除 lg={3}。
  test("keeps the long-tail grid directly inside the accordion at lg=6", () => {
    const view = renderSubtitle();

    act(() =>
      view.container.querySelector(".MuiAccordionSummary-root").click()
    );
    const content = view.container.querySelector(
      ".kt-settings-advanced__content"
    );

    expect(
      content.firstElementChild.classList.contains("MuiGrid-container")
    ).toBe(true);
    expect(
      content.querySelectorAll(".MuiGrid-grid-lg-6").length
    ).toBeGreaterThan(0);
    expect(content.querySelector(".MuiGrid-grid-lg-3")).toBeNull();

    view.unmount();
  });
});

describe("Subtitle page copy", () => {
  // 缺失的 i18n key 会渲染成空字符串而不是 key 名（hooks/I18n.js 的 defaultText 是 ""），
  // 而本文件把 useI18n mock 成了恒等函数，所以渲染断言完全看不出来。
  // 只能从源码提取 key 再对着 I18N 校验。
  test("covers every page copy key in all supported UI languages", () => {
    const source = fs.readFileSync(path.join(__dirname, "Subtitle.js"), "utf8");
    const keys = new Set(
      Array.from(
        source.matchAll(/\bi18n\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g),
        (match) => match[1]
      )
    );

    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) {
      for (const [language] of UI_LANGS) {
        expect(I18N[key]?.[language]).toEqual(expect.any(String));
        expect(I18N[key][language]).not.toBe("");
      }
    }
  });
});
