import { act } from "react";
import { createRoot } from "react-dom/client";
import TranForm, {
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "./TranForm";
import {
  MIN_RESIZE_HEIGHT,
  KEYBOARD_RESIZE_STEP,
} from "../../components/ResizeHandle";
import { apiDict } from "../../apis";
import { tryDetectLang } from "../../libs/detect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiDict: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => {
  const { newI18n } = jest.requireActual("../../config");
  return {
    useI18n: () => newI18n("en"),
  };
});

jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));

jest.mock("react-markdown", () => {
  const React = require("react");

  return ({ children }) => React.createElement("div", null, children);
});

jest.mock("./TranCont", () => {
  const React = require("react");

  return ({
    apiSlug,
    text,
    toLang,
    translateVariants,
    detectedLang,
    sourceDetectionPending,
  }) =>
    React.createElement("div", {
      "data-testid": "tran-cont",
      "data-api-slug": apiSlug,
      "data-text": text,
      "data-to-lang": toLang,
      "data-translate-variants": String(translateVariants),
      "data-detected-lang": detectedLang,
      "data-source-detection-pending": String(sourceDetectionPending),
    });
});

jest.mock("./DictCont", () => {
  const React = require("react");

  return () => React.createElement("div", { "data-testid": "default-dict" });
});

jest.mock("./Zdic", () => () => null);
jest.mock("./SugCont", () => () => null);

jest.mock("./AudioBtn", () => {
  const React = require("react");

  return {
    BrowserTtsBtn: () =>
      React.createElement("button", { type: "button" }, "speak"),
  };
});

jest.mock("./CopyBtn", () => {
  const React = require("react");

  return ({ text }) =>
    React.createElement(
      "button",
      { type: "button", "data-copy-text": text },
      "copy"
    );
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * 构造一个可手动 resolve / reject 的 Promise，用于测试中精确控制异步完成时机。
 */
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * 读取所有 Emotion 样式表规则文本（speedy 模式下规则通过 insertRule 写入
 * sheet.cssRules，textContent 为空；两者优先读取）。
 *
 * @returns {string} 合并后的 CSS 文本。
 */
function emotionCssText() {
  const tags = Array.from(document.querySelectorAll("style[data-emotion]"));
  return tags
    .flatMap((tag) => {
      const rules = tag.sheet && tag.sheet.cssRules;
      if (rules && rules.length) {
        return Array.from(rules).map((r) => r.cssText || "");
      }
      return [tag.textContent || ""];
    })
    .join("\n");
}

/**
 * 构造 prefers-reduced-motion 的 matchMedia stub。
 *
 * @param {boolean} matches 是否开启"减少动态效果"。
 * @returns {Function} 可赋给 window.matchMedia 的 jest mock。
 */
function matchMediaStub(matches) {
  return jest.fn().mockReturnValue({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
}

function renderTranForm(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TranForm
        text="library"
        setText={jest.fn()}
        apiSlugs={[]}
        fromLang="en"
        toLang="zh-CN"
        toLang2="-"
        transApis={[
          {
            apiSlug: "openai",
            apiName: "OpenAI",
            apiType: "OpenAI",
            dictPrompt: "Dictionary prompt",
          },
        ]}
        simpleStyle
        langDetector="-"
        enDict="Bing"
        enSug="-"
        aiDictApiSlug="openai"
        selectionContext="The library is open."
        {...props}
      />
    );
  });

  return { container, root };
}

describe("TranForm AI dictionary tab", () => {
  beforeEach(() => {
    apiDict.mockReset();
    apiDict.mockResolvedValue("## library");
    document.body.innerHTML = "";
  });

  test.each([true, false])(
    "opens the AI dictionary tab once with selection context when simpleStyle is %s",
    async (simpleStyle) => {
      const { container, root } = renderTranForm({ simpleStyle });
      await flushEffects();

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(2);
      expect(apiDict).not.toHaveBeenCalled();

      await act(async () => {
        tabs[1].dispatchEvent(
          new MouseEvent("click", { bubbles: true, button: 0 })
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(apiDict).toHaveBeenCalledTimes(1);
      expect(apiDict).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "library",
          context: "The library is open.",
        })
      );

      act(() => {
        root.unmount();
      });
    }
  );

  test("keeps the AI dictionary tab selected when text changes", async () => {
    const { container, root } = renderTranForm();
    await flushEffects();

    let tabs = container.querySelectorAll('[role="tab"]');
    await act(async () => {
      tabs[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <TranForm
          text="baseline"
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[
            {
              apiSlug: "openai",
              apiName: "OpenAI",
              apiType: "OpenAI",
              dictPrompt: "Dictionary prompt",
            },
          ]}
          simpleStyle
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="openai"
          selectionContext="If you create a baseline at this point."
        />
      );
    });
    await flushEffects();

    tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(apiDict).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "baseline",
        context: "If you create a baseline at this point.",
      })
    );

    act(() => {
      root.unmount();
    });
  });
});

describe("TranForm translation service selection", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  test("uses translationText for every translation service", async () => {
    const { container, root } = renderTranForm({
      text: "First line\nSecond line",
      translationText: "First line Second line",
      apiSlugs: ["google", "openai"],
      transApis: [
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ],
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (element) => element.dataset.text
      )
    ).toEqual(["First line Second line", "First line Second line"]);

    act(() => root.unmount());
  });

  test("switches to the secondary target when Chinese variants are disabled", async () => {
    tryDetectLang.mockResolvedValue("zh-TW");
    const { container, root } = renderTranForm({
      text: "繁體中文",
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "en",
      translateVariants: false,
    });
    await flushEffects();

    const translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.toLang).toBe("en");
    expect(translation.dataset.translateVariants).toBe("false");

    act(() => root.unmount());
  });

  test("keeps the primary target when Chinese variants are enabled", async () => {
    tryDetectLang.mockResolvedValue("zh-TW");
    const { container, root } = renderTranForm({
      text: "繁體中文",
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "en",
      translateVariants: true,
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="tran-cont"]').dataset.toLang
    ).toBe("zh-CN");

    act(() => root.unmount());
  });

  test("passes only the current complete-input detection result to translations", async () => {
    const firstDetection = createDeferred();
    const secondDetection = createDeferred();
    tryDetectLang.mockImplementation((value) =>
      value === "first" ? firstDetection.promise : secondDetection.promise
    );
    const transApis = [
      { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
    ];
    const baseProps = {
      setText: jest.fn(),
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "-",
      transApis,
      simpleStyle: false,
      langDetector: "Baidu",
      enDict: "-",
      enSug: "-",
      aiDictApiSlug: "-",
    };
    const { container, root } = renderTranForm({
      ...baseProps,
      text: "first",
    });
    await flushEffects();

    act(() => {
      root.render(<TranForm {...baseProps} text="second" />);
    });
    await flushEffects();
    let translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("");
    expect(translation.dataset.sourceDetectionPending).toBe("true");

    await act(async () => {
      firstDetection.resolve("fr");
      await firstDetection.promise;
    });
    translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("");
    expect(translation.dataset.sourceDetectionPending).toBe("true");

    await act(async () => {
      secondDetection.resolve("de");
      await secondDetection.promise;
    });
    translation = container.querySelector('[data-testid="tran-cont"]');
    expect(translation.dataset.detectedLang).toBe("de");
    expect(translation.dataset.sourceDetectionPending).toBe("false");

    act(() => root.unmount());
  });

  test("keeps user-selected services when text changes", async () => {
    const setText = jest.fn();
    const transApis = [
      {
        apiSlug: "google",
        apiName: "Google",
        apiType: "Google",
      },
      {
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
      },
    ];
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      apiSlugs: ["google"],
      transApis,
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    const apiSlugsInput = container.querySelector('input[name="apiSlugs"]');
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector(
        '[role="combobox"], [role="button"], [aria-haspopup="listbox"]'
      );
    await act(async () => {
      apiSlugsButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      await Promise.resolve();
    });

    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.render(
        <TranForm
          text="hello world"
          setText={setText}
          apiSlugs={["google"]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
        />
      );
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.unmount();
    });
  });
});

describe("TranForm input focus and external text synchronization", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  test("focuses the original text input when auto focus is enabled", async () => {
    const { container, root } = renderTranForm({
      text: "",
      simpleStyle: false,
      autoFocusInput: true,
    });
    await flushEffects();

    expect(document.activeElement).toBe(container.querySelector("textarea"));
    act(() => root.unmount());
  });

  test("does not focus the original text input when auto focus is disabled", async () => {
    const { container, root } = renderTranForm({
      text: "bug",
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();

    expect(document.activeElement).not.toBe(
      container.querySelector("textarea")
    );
    act(() => root.unmount());
  });

  test("focuses after asynchronous initialization allows auto focus", async () => {
    const props = {
      text: "",
      simpleStyle: false,
      autoFocusInput: false,
    };
    const { container, root } = renderTranForm(props);
    await flushEffects();
    const input = container.querySelector("textarea");
    expect(document.activeElement).not.toBe(input);

    act(() => {
      root.render(
        <TranForm
          text=""
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[]}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput
        />
      );
    });
    await flushEffects();

    expect(document.activeElement).toBe(input);
    act(() => root.unmount());
  });

  test("keeps clipboard text visible and submits it after blur while editing", async () => {
    const setText = jest.fn();
    const transApis = [];
    const { container, root } = renderTranForm({
      text: "",
      setText,
      transApis,
      simpleStyle: false,
      autoFocusInput: true,
      syncExternalTextWhileEditing: true,
    });
    await flushEffects();

    act(() => {
      root.render(
        <TranForm
          text="bug"
          setText={setText}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput={false}
          syncExternalTextWhileEditing
        />
      );
    });
    await flushEffects();

    const input = container.querySelector("textarea");
    expect(input.value).toBe("bug");

    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    expect(setText).toHaveBeenLastCalledWith("bug");
    act(() => root.unmount());
  });

  test("reduced-motion true blur resets editMode so external text keeps syncing", async () => {
    // N7 系统回归：开启"减少动态效果"后真离场，editMode 必须随同步关闭归位，
    // 否则外部划词 text 永久无法刷新输入框（§1.4 用户路径）。
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = matchMediaStub(true);
    try {
      const setText = jest.fn();
      const props = {
        text: "first",
        setText,
        apiSlugs: [],
        fromLang: "en",
        toLang: "zh-CN",
        toLang2: "-",
        transApis: [],
        simpleStyle: false,
        langDetector: "-",
        enDict: "-",
        enSug: "-",
        aiDictApiSlug: "-",
        autoFocusInput: false,
      };
      const { container, root } = renderTranForm(props);
      await flushEffects();

      const input = container.querySelector("textarea");
      act(() => {
        input.focus();
      });

      // 编辑（原生 value setter 触发受控 onChange → setEditMode(true)）
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      act(() => {
        setter.call(input, "edited");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      // 真离场（relatedTarget=null）：立即提交
      await act(async () => {
        input.blur();
        await Promise.resolve();
      });
      expect(setText).toHaveBeenLastCalledWith("edited");

      // 外部划词更新 text：输入框必须同步新词
      act(() => {
        root.render(<TranForm {...props} text="second word" />);
      });
      await flushEffects();
      expect(container.querySelector("textarea").value).toBe("second word");

      act(() => root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
      // 防御性恢复真实 timers（AGENTS §五.2 C 类模板的收尾形态）。静态已证本用例
      // 不创建也不继承 fake timers：文件内 10 处 useFakeTimers 均 try/finally 成对
      // （:576→:606 等）、无 setupTests.js 全局配置、目标 describe（:408）在所有
      // timer 用例（:524 起）之前执行——此处非正确性必需，属卫生性收尾。
      jest.useRealTimers();
    }
  });
});

describe("TranForm original text edit and submit controls", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
   * @param {string} type 事件类型（如 pointerdown/pointermove）。
   * @param {Object} opts 可选的 clientY 与 pointerId。
   * @returns {Event} 可被 React 与 jsdom 识别的指针事件。
   */
  function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  }

  /**
   * 构造一个带 touches 数组的触摸事件。
   *
   * @param {Array<{clientY: number}>} touches 触点数组。
   * @returns {Event} 可被 React 与 jsdom 识别的触摸事件。
   */
  function makeTouchEvent(type, touches) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    Object.defineProperty(event, "targetTouches", { value: touches });
    return event;
  }

  /**
   * 使用原生 value setter 修改受控 textarea 的值并触发 React onChange。
   *
   * @param {HTMLTextAreaElement} input textarea 元素。
   * @param {string} value 新值。
   */
  function changeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  test("shows the submit button while editing and hides everything on blur", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root } = renderTranForm({
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");
      // 失焦时整个右上操作组卸载，不留可命中热区
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();

      act(() => {
        input.focus();
      });
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();

      // 失焦：rail 播放退出动画，120ms 内仍滞留
      act(() => {
        input.blur();
      });
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();

      // 退出动画结束后控件卸载
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("clicking submit keeps focus on the textarea and commits exactly once", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");

    act(() => {
      input.focus();
    });
    changeInputValue(input, "  hello world  ");

    // 浏览器真实事件顺序：按钮 mousedown 先于任何 blur 发生。
    // onMouseDown 的 preventDefault 阻止 textarea 因按下按钮而失焦，
    // 因此随后不会触发卸载打勾按钮的 blur。
    const submit = container.querySelector('[aria-label="Submit"]');
    act(() => {
      submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();

    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(setText).toHaveBeenCalledTimes(1);
    expect(setText).toHaveBeenCalledWith("hello world");
    // 提交后退出编辑模式，打勾按钮不再渲染
    expect(container.querySelector('[aria-label="Submit"]')).toBeNull();

    act(() => root.unmount());
  });

  test("blur arriving between mousedown and click does not double-commit", async () => {
    jest.useFakeTimers("legacy");
    try {
      const setText = jest.fn();
      const { container, root } = renderTranForm({
        text: "hello",
        setText,
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");

      act(() => {
        input.focus();
      });
      changeInputValue(input, "  hello world  ");

      const submit = container.querySelector('[aria-label="Submit"]');
      // 最坏事件时序：mousedown 触发后，blur 仍抢先发生（例如键盘焦点转移）。
      act(() => {
        submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      await act(async () => {
        input.blur();
        await Promise.resolve();
      });
      // blur 路径已经完成唯一一次 trim 提交
      expect(setText).toHaveBeenCalledTimes(1);
      expect(setText).toHaveBeenCalledWith("hello world");

      // 推进退出动画：submit 随 rail 卸载而脱离 DOM，迟到 click 不再触发二次提交
      act(() => {
        jest.advanceTimersByTime(120);
      });
      // 后续 click 落在已卸载的旧节点上，不应产生第二次提交
      act(() => {
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(setText).toHaveBeenCalledTimes(1);

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("blur and explicit submit share the same trimmed commit path", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");

    // 失焦提交：一次操作只产生一次有效更新，且执行首尾空白处理
    act(() => {
      input.focus();
    });
    changeInputValue(input, "  blur commit  ");
    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    expect(setText).toHaveBeenCalledTimes(1);
    expect(setText).toHaveBeenLastCalledWith("blur commit");

    act(() => root.unmount());
  });

  test("clearing the buffer switches the rail to paste immediately and unmounts on blur", async () => {
    jest.useFakeTimers("legacy");
    try {
      const setText = jest.fn();
      const { container, root } = renderTranForm({
        text: "hello",
        setText,
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");

      act(() => {
        input.focus();
      });
      // 清空缓冲：rail 立即切换为空态粘贴（内容随编辑缓冲真源，无需先提交空串）
      changeInputValue(input, "");
      expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();

      // 失焦：退出动画期间 rail 内容仍是 Paste（随缓冲），120ms 后卸载不留热区
      act(() => {
        input.blur();
      });
      expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(container.querySelector('[aria-label="Paste"]')).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("shows paste, copy, submit and the resize handle only while focused", async () => {
    jest.useFakeTimers("legacy");
    try {
      // 记录父组件最新 text，模拟 setText 生效后的父组件重渲染
      let committed = "";
      const setText = jest.fn().mockImplementation((next) => {
        committed = next;
      });
      const { container, root } = renderTranForm({
        text: "",
        setText,
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");

      // 失焦空态：粘贴、提交、复制与缩放手柄全部卸载，不留可命中热区
      expect(container.querySelector('[aria-label="Paste"]')).toBeNull();
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);

      // 聚焦空缓冲：右上切换为粘贴，缩放手柄仍隐藏
      act(() => {
        input.focus();
      });
      expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();

      // 输入内容并通过打勾按钮提交（mousedown 阻止失焦）：焦点保留、退出编辑态
      changeInputValue(input, "hello");
      const submit = container.querySelector('[aria-label="Submit"]');
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      act(() => {
        root.render(
          <TranForm
            text={committed}
            setText={setText}
            apiSlugs={[]}
            fromLang="en"
            toLang="zh-CN"
            toLang2="-"
            transApis={[]}
            simpleStyle={false}
            autoFocusInput={false}
            langDetector="-"
            enDict="Bing"
            enSug="-"
            aiDictApiSlug="-"
          />
        );
      });
      await flushEffects();

      // 聚焦且有已提交内容、非编辑态：显示复制和缩放手柄
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(true);
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).not.toBeNull();

      // 失焦：缩放手柄与复制 rail 同构，均播放退出动画后卸载（不再瞬时卸载）
      act(() => {
        input.blur();
      });
      // 退出动画期间复制按钮与缩放手柄仍在 DOM（淡出中）
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(true);
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();

      // 再次聚焦有内容：进入编辑态显示提交；右下缩放手柄在聚焦且有内容时显示
      act(() => {
        input.focus();
      });
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).not.toBeNull();

      // 编辑态清空：rail 立即恢复为空态粘贴（焦点保留，无需先提交空串）
      changeInputValue(input, "");
      act(() => {
        root.render(
          <TranForm
            text={committed}
            setText={setText}
            apiSlugs={[]}
            fromLang="en"
            toLang="zh-CN"
            toLang2="-"
            transApis={[]}
            simpleStyle={false}
            autoFocusInput={false}
            langDetector="-"
            enDict="Bing"
            enSug="-"
            aiDictApiSlug="-"
          />
        );
      });
      await flushEffects();
      expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("typing again after a Done submit restores the edit mode and keeps new characters", async () => {
    jest.useFakeTimers("legacy");
    try {
      let committed = "";
      const setText = jest.fn().mockImplementation((next) => {
        committed = next;
      });
      const { container, root } = renderTranForm({
        text: "hello",
        setText,
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");

      act(() => {
        input.focus();
      });
      // 编辑并点击勾选提交（Done 的 mousedown preventDefault 保持 textarea 焦点）
      changeInputValue(input, "hello world");
      const submit = container.querySelector('[aria-label="Submit"]');
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(committed).toBe("hello world");

      // 真实父组件把提交值回写回 TranForm
      act(() => {
        root.render(
          <TranForm
            text={committed}
            setText={setText}
            apiSlugs={[]}
            fromLang="en"
            toLang="zh-CN"
            toLang2="-"
            transApis={[]}
            simpleStyle={false}
            autoFocusInput={false}
            langDetector="-"
            enDict="Bing"
            enSug="-"
            aiDictApiSlug="-"
          />
        );
      });
      await flushEffects();

      // 提交后非编辑态：rail 显示复制
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(true);

      // Done 的 mousedown preventDefault 使焦点保留在 textarea，继续输入
      expect(document.activeElement).toBe(input);
      changeInputValue(input, "hello world!  ");
      expect(input.value).toBe("hello world!  ");

      // 继续输入必须恢复编辑/提交态（onChange 应调用 setEditMode(true)）
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("pasting restores the edit mode and keeps the rail in the Done submit state", async () => {
    jest.useFakeTimers("legacy");
    try {
      let committed = "hello";
      const setText = jest.fn().mockImplementation((next) => {
        committed = next;
      });
      const { container, root } = renderTranForm({
        text: committed,
        setText,
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      const input = container.querySelector("textarea");

      act(() => {
        input.focus();
      });
      // 清空缓冲：rail 立即切换为空态粘贴（无需先提交空串）
      changeInputValue(input, "");
      act(() => {
        root.render(
          <TranForm
            text={committed}
            setText={setText}
            apiSlugs={[]}
            fromLang="en"
            toLang="zh-CN"
            toLang2="-"
            transApis={[]}
            simpleStyle={false}
            autoFocusInput={false}
            langDetector="-"
            enDict="Bing"
            enSug="-"
            aiDictApiSlug="-"
          />
        );
      });
      await flushEffects();

      // 空态非编辑聚焦：rail 显示粘贴按钮
      expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();

      // stub 剪贴板：点击粘贴后必须恢复编辑/提交态
      const originalClipboard = global.navigator.clipboard;
      global.navigator.clipboard = {
        readText: jest.fn().mockResolvedValue("  pasted text  "),
      };
      try {
        await act(async () => {
          const pasteBtn = container.querySelector('[aria-label="Paste"]');
          pasteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await Promise.resolve();
          await Promise.resolve();
        });
      } finally {
        global.navigator.clipboard = originalClipboard;
      }

      // 父组件收到 trim 后的粘贴文本
      expect(setText).toHaveBeenLastCalledWith("pasted text");
      // 粘贴后 rail 必须进入编辑/提交态（handlePaste 应 setEditMode(true)）
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Paste"]')).toBeNull();
      expect(input.value).toBe("pasted text");

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("copy in the non-edit rail copies the current edit buffer", async () => {
    let committed = "hello";
    const setText = jest.fn().mockImplementation((next) => {
      committed = next;
    });
    const { container, root } = renderTranForm({
      text: committed,
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");

    act(() => {
      input.focus();
    });
    // 编辑缓冲后提交退出编辑态：非编辑 rail 显示复制按钮，复制源为当前缓冲
    changeInputValue(input, "hello world");
    const submit = container.querySelector('[aria-label="Submit"]');
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    // 父组件回写提交文本后重渲染（非编辑态 editText 从 text 同步）
    act(() => {
      root.render(
        <TranForm
          text={committed}
          setText={setText}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[]}
          simpleStyle={false}
          autoFocusInput={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
        />
      );
    });
    await flushEffects();
    const copyBtn = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "copy"
    );
    expect(copyBtn).toBeDefined();
    expect(copyBtn.dataset.copyText).toBe("hello world");

    // 提交后继续输入回到编辑态：rail 切回提交按钮，复制按钮消失
    changeInputValue(input, "hello world!");
    expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "copy"
      )
    ).toBe(false);

    act(() => root.unmount());
  });

  test("copy reflects the synced external text after done without a parent re-render", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");

    act(() => {
      input.focus();
    });
    // 输入带尾随空格的缓冲并点 Done：父组件 setText 被调用，但 harness 不回写
    // 重渲染（text prop 恒为 "hello"）
    changeInputValue(input, "hello ");
    const submit = container.querySelector('[aria-label="Submit"]');
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    // 稳态恒等回归锁（预期通过，非缺陷修复）：Done 翻转 editMode 后，同步
    // effect 以外部 text 归位 editText，非编辑 rail 的复制缓冲不残留尾随空格
    await flushEffects();
    const copyBtn = container.querySelector("[data-copy-text]");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.dataset.copyText).toBe("hello");

    act(() => root.unmount());
  });

  test("paste is harmless when the clipboard API is unavailable", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");

    // 空框聚焦：rail 直接显示粘贴按钮（空缓冲即 Paste，无需先提交空串）
    act(() => {
      input.focus();
    });
    expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();
    // 聚焦本身不触发 setText，以该基线计数判定粘贴是否额外回写
    const setTextCallsAfterSetup = setText.mock.calls.length;

    // 剪贴板能力缺失（非安全上下文等）：粘贴必须无操作、无 unhandled rejection
    const originalClipboard = global.navigator.clipboard;
    global.navigator.clipboard = undefined;
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await act(async () => {
        const pasteBtn = container.querySelector('[aria-label="Paste"]');
        pasteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
      global.navigator.clipboard = originalClipboard;
    }

    expect(unhandled.length).toBe(0);
    // 不得改动文本或翻回编辑态
    expect(setText.mock.calls.length).toBe(setTextCallsAfterSetup);
    expect(input.value).toBe("");
    expect(container.querySelector('[aria-label="Paste"]')).not.toBeNull();

    act(() => root.unmount());
  });

  test("resize handle appears as soon as the box has content and hides when cleared (gated on editText)", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");
    const handleSel = '[data-testid="tranform-resize-handle"]';

    // 空框聚焦：缩放手柄隐藏（无内容）
    act(() => {
      input.focus();
    });
    expect(container.querySelector(handleSel)).toBeNull();

    // 空框输入内容：手柄立即出现（即使父组件 text 仍为空，门控依据 editText）
    changeInputValue(input, "abc");
    expect(container.querySelector(handleSel)).not.toBeNull();

    // 清空已有内容：手柄立即隐藏（依据当前 editText.trim()）
    changeInputValue(input, "");
    expect(container.querySelector(handleSel)).toBeNull();

    act(() => root.unmount());
  });
});

describe("TranForm original text ResizeHandle", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
   * @param {string} type 事件类型（如 pointerdown/pointermove）。
   * @param {Object} opts 可选的 clientY 与 pointerId。
   * @returns {Event} 可被 React 与 jsdom 识别的指针事件。
   */
  function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  }

  /**
   * 构造一个带 touches 数组的触摸事件。
   *
   * @param {Array<{clientY: number, identifier?: number}>} touches 当前触点数组。
   * @param {Object} [opts] 可选参数。
   * @param {Array<{identifier?: number}>} [opts.changedTouches] 结算触点数组
   *   （touchend/touchcancel 传入），缺省时与 touches 相同。
   * @returns {Event} 可被 React 与 jsdom 识别的触摸事件。
   */
  function makeTouchEvent(type, touches, { changedTouches } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    Object.defineProperty(event, "targetTouches", { value: touches });
    Object.defineProperty(event, "changedTouches", {
      value: changedTouches !== undefined ? changedTouches : touches,
    });
    return event;
  }

  /**
   * 渲染原文输入框并使其聚焦：focus-gating 下操作组与缩放手柄只在聚焦时显示。
   *
   * @param {Object} props 覆盖默认组件参数（默认 text="hello"）。
   * @returns {{container: HTMLElement, root: Object, input: HTMLTextAreaElement}} 渲染结果与 textarea。
   */
  async function renderFocusedForm(props = {}) {
    const rendered = renderTranForm({
      text: "hello",
      simpleStyle: false,
      autoFocusInput: false,
      ...props,
    });
    await flushEffects();
    const input = rendered.container.querySelector("textarea");
    act(() => {
      input.focus();
    });
    return { ...rendered, input };
  }

  test("does not resize within the 6px threshold and resizes above it", async () => {
    const { container, root } = await renderFocusedForm();

    // TranForm 同时渲染语言下拉等 TextField，必须定位包含原文 textarea 的 InputBase
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    expect(handle).not.toBeNull();

    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });

    // 纵向移动 6px 内：不进入高度调整
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 6 }));
    });
    expect(textField.style.height).toBe("");

    // 超过 6px 后启动高度调整（100 + 7 = 107）
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 7 }));
    });
    expect(textField.style.height).toBe("107px");

    // 继续拖动继续调整（100 + 20 = 120）
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    expect(textField.style.height).toBe("120px");

    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 20 }));
    });
    act(() => root.unmount());
  });

  test("touch path also applies the 6px threshold", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    await act(async () => {
      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientY: 0 }]));
    });
    // 手指抖动 5px：低于阈值，不改变高度
    await act(async () => {
      window.dispatchEvent(makeTouchEvent("touchmove", [{ clientY: 5 }]));
    });
    expect(textField.style.height).toBe("");

    // 超过 6px 后 touch 路径同样启动（100 + 8 = 108）
    await act(async () => {
      window.dispatchEvent(makeTouchEvent("touchmove", [{ clientY: 8 }]));
    });
    expect(textField.style.height).toBe("108px");

    await act(async () => {
      window.dispatchEvent(new Event("touchend"));
    });
    act(() => root.unmount());
  });

  test("continues resizing based on the active touch when a second touch is inserted or reordered", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 活动触点 identifier=1 发起拖动，第二个触点 identifier=2 随后加入
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });
    // 第二触点排在最前移动（顺序变化），高度仍必须跟随触点 1
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [
          { clientY: 90, identifier: 2 },
          { clientY: 20, identifier: 1 },
        ])
      );
    });
    expect(textField.style.height).toBe("120px");

    // 第二触点继续移动不影响高度
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [
          { clientY: 40, identifier: 2 },
          { clientY: 20, identifier: 1 },
        ])
      );
    });
    expect(textField.style.height).toBe("120px");

    // 活动触点进一步移动仍生效（100 + 40 = 140）
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [
          { clientY: 40, identifier: 2 },
          { clientY: 40, identifier: 1 },
        ])
      );
    });
    expect(textField.style.height).toBe("140px");

    // 活动触点结束
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], { changedTouches: [{ identifier: 1 }] })
      );
    });
    act(() => root.unmount());
  });

  test("a non-active touch ending does not end or corrupt the active resize session", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [
          { clientY: 20, identifier: 1 },
          { clientY: 5, identifier: 2 },
        ])
      );
    });
    expect(textField.style.height).toBe("120px");

    // 非活动触点（identifier=2）抬起：不得结束活动会话
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [{ identifier: 1 }], {
          changedTouches: [{ identifier: 2 }],
        })
      );
    });
    // 活动触点继续移动仍改变高度，会话未被非活动触点接管（100 + 30 = 130）
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 30, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("130px");

    // 活动触点结束
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], {
          changedTouches: [{ identifier: 1 }],
        })
      );
    });
    // 会话结束后后续 move 不再生效
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 50, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("130px");

    act(() => root.unmount());
  });

  test("active touchcancel and unmount stop further height changes", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // touchcancel：活动触点被系统取消，会话必须结束
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 30, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("130px");

    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchcancel", [], {
          changedTouches: [{ identifier: 1 }],
        })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 50, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("130px");

    // 新会话开始：第二轮以第一次结束时的受控高度 130px 为基线，
    // start -> active touchend 后 move 不再生效
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 25, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("155px");

    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], { changedTouches: [{ identifier: 1 }] })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 60, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("155px");

    act(() => root.unmount());
  });

  test("matched touchmove is default-prevented while stranger touches are not", async () => {
    const { container, root } = await renderFocusedForm();

    // 必须经 textarea.closest 定位原文 InputBase：直接以
    // container.querySelector(".MuiInputBase-root") 查询时首匹配命中的是
    // apiSlugs 多选下拉根节点，offsetHeight 桩与 style 断言会双双落错节点
    //（本套件统一采用 closest 定位模式，见首用例告诫注释）。
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 进入 Touch 会话（发起触点 identifier=1）
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });

    // ①命中发起触点的 touchmove：必须 preventDefault（页面防滚）且高度跟随
    const matched = makeTouchEvent("touchmove", [
      { clientY: 30, identifier: 1 },
    ]);
    await act(async () => {
      window.dispatchEvent(matched);
    });
    expect(matched.defaultPrevented).toBe(true);
    expect(textField.style.height).toBe("130px");

    // ②仅含非发起触点的 touchmove：不得 preventDefault、不得改高度
    //（保留用户以其余手指滚动页面的能力）
    const stranger = makeTouchEvent("touchmove", [
      { clientY: 60, identifier: 2 },
    ]);
    await act(async () => {
      window.dispatchEvent(stranger);
    });
    expect(stranger.defaultPrevented).toBe(false);
    expect(textField.style.height).toBe("130px");

    // 会话结束（监听撤除）后：move 不再 preventDefault、不再改高度
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], {
          changedTouches: [{ identifier: 1 }],
        })
      );
    });
    const after = makeTouchEvent("touchmove", [
      { clientY: 90, identifier: 1 },
    ]);
    await act(async () => {
      window.dispatchEvent(after);
    });
    expect(after.defaultPrevented).toBe(false);
    expect(textField.style.height).toBe("130px");

    act(() => root.unmount());
  });

  test("a second pointer's move and up do not hijack or end the active session", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 发起指针 pointerId=1 建立 Pointer 会话
    await act(async () => {
      handle.dispatchEvent(
        makePointerEvent("pointerdown", { clientY: 0, pointerId: 1 })
      );
    });

    // 第二指针 pointerId=2 的移动不得改变高度
    await act(async () => {
      window.dispatchEvent(
        makePointerEvent("pointermove", { clientY: 40, pointerId: 2 })
      );
    });
    expect(textField.style.height).toBe("");

    // 第二指针抬起不得结束会话
    await act(async () => {
      window.dispatchEvent(
        makePointerEvent("pointerup", { clientY: 40, pointerId: 2 })
      );
    });

    // 发起指针继续移动仍然生效
    await act(async () => {
      window.dispatchEvent(
        makePointerEvent("pointermove", { clientY: 20, pointerId: 1 })
      );
    });
    expect(textField.style.height).toBe("120px");

    // 发起指针 pointerup(pointerId=1) 才结束会话
    await act(async () => {
      window.dispatchEvent(
        makePointerEvent("pointerup", { clientY: 20, pointerId: 1 })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makePointerEvent("pointermove", { clientY: 60, pointerId: 1 })
      );
    });
    expect(textField.style.height).toBe("120px");

    act(() => root.unmount());
  });

  test("a second finger touchend does not end an active pointer session", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 发起指针建立 Pointer 会话并拖出阈值
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 30 }));
    });
    expect(textField.style.height).toBe("130px");

    // Pointer 会话期间第二指 touchend（无 touches、结算其他 identifier）
    // 不得终止会话
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], {
          changedTouches: [{ identifier: 2 }],
        })
      );
    });

    // 指针 1 继续移动仍然生效
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
    });
    expect(textField.style.height).toBe("150px");

    // 发起指针 pointerup(pointerId=1) 才结束会话
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 50 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 80 }));
    });
    expect(textField.style.height).toBe("150px");

    act(() => root.unmount());
  });

  test("a stray pointerup does not end an active touch session", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 发起触点 identifier=1 建立 Touch 会话并拖出阈值
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 30, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("130px");

    // Touch 会话期间杂散 pointerup（鼠标/第二设备）不得终止会话
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 30 }));
    });

    // 发起触点继续移动仍然生效
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 50, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("150px");

    // 发起触点 touchend 才结束会话
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], {
          changedTouches: [{ identifier: 1 }],
        })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 80, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("150px");

    act(() => root.unmount());
  });

  test("drag height lands on the InputBase root and the visible textarea scrolls internally", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 拖动 200px：受控像素高度 300px 直接落在 InputBase 根节点（已超过
    // 10 行高度，maxRows 钳制必须释放，不得把内框压回固定行高形成死区）
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 200 }));
    });
    expect(textField.style.height).toBe("300px");
    // 受控高度落在 InputBase 根节点；根节点不持有受控 overflowY
    // （避免 MUI TextareaAutosize 每帧重写 textarea.style.overflow 与 root 级
    // 滚动形成双滚动条）
    expect(textField.style.overflowY).toBe("");

    // 可见 textarea（过滤测量用 shadow 副本）的强制滚动规则来自 scoped sx
    // （`& textarea:not([aria-hidden="true"])`），不写入 React inline style。
    // MUI TextareaAutosize 每帧会重写 textarea.style.overflow（通常为 "hidden"），
    // 但 emotion scoped 规则以 `!important` 优先——在真浏览器中强制滚动。
    // jsdom 中仅验证 scoped 规则存在，不验证 inline overflow（MUI 会写入）。
    const visibleTextareas = Array.from(
      container.querySelectorAll("textarea")
    ).filter((ta) => ta.tabIndex !== -1);
    expect(visibleTextareas.length).toBe(1);
    expect(visibleTextareas[0].style.maxHeight).toBe("");

    // 情感样式表存在同时匹配 textarea:not([aria-hidden=...]) 与
    // overflow: auto !important 的 scoped 强制滚动规则（Emotion speedy 模式经
    // sheet.cssRules 写入，容忍引号/空格规范化）
    expect(emotionCssText()).toMatch(
      /textarea:not\(\[aria-hidden=['"]true['"]\]\)\s*\{[^}]*overflow:\s*auto\s*!important/
    );
    // 测量用 shadow textarea 不命中强制滚动规则（aria-hidden="true" 排除），
    // 其测量关键基准 height:0 必须原样保留
    const shadowTextareas = Array.from(
      container.querySelectorAll("textarea")
    ).filter((ta) => ta.tabIndex === -1);
    for (const shadow of shadowTextareas) {
      expect(shadow.style.height).toBe("0px");
    }

    act(() => root.unmount());
  });

  test("pointer and touch start events never reach the outer container", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    // 模拟外层拖动/缩放容器（DraggableResizable）挂载的事件监听器
    const outerPointerSpy = jest.fn();
    const outerTouchSpy = jest.fn();
    document.body.addEventListener("pointerdown", outerPointerSpy);
    document.body.addEventListener("touchstart", outerTouchSpy);

    act(() => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientY: 0 }]));
    });

    expect(outerPointerSpy).not.toHaveBeenCalled();
    expect(outerTouchSpy).not.toHaveBeenCalled();

    document.body.removeEventListener("pointerdown", outerPointerSpy);
    document.body.removeEventListener("touchstart", outerTouchSpy);
    act(() => root.unmount());
  });

  test("a gesture starting outside the hot area never starts resizing", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    const textarea = container.querySelector("textarea");

    // 手势从热区外的正文区开始，即使之后移动任意距离也不得进入缩放
    await act(async () => {
      textarea.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 100 }));
    });
    expect(textField.style.height).toBe("");

    act(() => root.unmount());
  });

  test("removes all window listeners on unmount while dragging a pointer session", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    // 进入拖动会话。jsdom 无 Pointer capture，pointerdown 激活完整 window fallback，
    // 会话期间 window 上存在 pointermove/pointerup/pointercancel 降级监听。
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });

    const removeSpy = jest.spyOn(window, "removeEventListener");
    act(() => root.unmount());

    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    for (const type of ["pointermove", "pointerup", "pointercancel", "blur"]) {
      expect(removedTypes).toContain(type);
    }
    removeSpy.mockRestore();
  });

  test("removes all window listeners on unmount while dragging a touch session", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    // 进入 Touch 会话：touchmove/touchend/touchcancel 监听仅随活动会话安装
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });

    const removeSpy = jest.spyOn(window, "removeEventListener");
    act(() => root.unmount());

    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    for (const type of ["touchmove", "touchend", "touchcancel", "blur"]) {
      expect(removedTypes).toContain(type);
    }
    removeSpy.mockRestore();
  });

  test("gives the resize handle a non-empty accessible name via the real i18n dictionary", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    expect(handle).not.toBeNull();
    // 使用真实 I18N 字典获取本地化文案，不依赖硬编码 fallback
    expect(handle.getAttribute("aria-label")).toBeTruthy();
    expect(handle.getAttribute("title")).toBeTruthy();
    expect(handle.getAttribute("aria-label")).toBe(
      jest.requireActual("../../config").newI18n("en")("field_resize_height")
    );

    act(() => root.unmount());
  });

  test("keeps the scoped textarea rule free of reserved right/bottom padding", async () => {
    const { container, root } = await renderFocusedForm();

    // 未拖动输入框不得携带常驻 paddingRight/paddingBottom：它们会把可见
    // textarea 排版宽度压窄于 shadow 测量框（paddingRight）或把最小高度下的
    // 可显示区压成不足一行（paddingBottom）。jsdom 下经 emotion cssRules
    // 断言 scoped 规则文本本身。
    const emotionCss = Array.from(
      document.querySelectorAll("style[data-emotion]")
    )
      .flatMap((tag) => {
        const rules = tag.sheet && tag.sheet.cssRules;
        if (rules && rules.length) {
          return Array.from(rules).map((r) => r.cssText || "");
        }
        return [tag.textContent || ""];
      })
      .join("\n");
    expect(emotionCss).not.toMatch(
      /textarea:not\(\[aria-hidden=['"]true['"]\]\)\s*\{[^}]*padding-(right|bottom)/
    );

    act(() => root.unmount());
  });

  test("a manually resized box keeps the handle visible after clearing content so it can be shrunk back", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "",
      setText,
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();
    const input = container.querySelector("textarea");
    const handleSel = '[data-testid="tranform-resize-handle"]';
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;

    // 空框聚焦：无内容时手柄隐藏
    act(() => {
      input.focus();
    });
    expect(container.querySelector(handleSel)).toBeNull();

    // 输入内容：手柄出现
    act(() => {
      setter.call(input, "abc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const handle = container.querySelector(handleSel);
    expect(handle).not.toBeNull();

    // 拖动放大产生手动高度
    const textField = input.closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 200 }));
    });
    expect(textField.style.height).toBe("300px");

    // 清空内容：已有手动高度构成显示手柄的理由，仍可继续缩回
    act(() => {
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector(handleSel)).not.toBeNull();

    act(() => root.unmount());
  });

  test("exposes a keyboard-operable separator with arrow-key resizing", async () => {
    const { container, root, input } = await renderFocusedForm();

    const textField = input.closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // keyboard-operable separator：保留可读名称，且可聚焦、支持方向键调整
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-label")).toBeTruthy();
    expect(handle.getAttribute("title")).toBeTruthy();
    expect(handle.getAttribute("tabindex")).toBe("0");
    // 手柄物理上是贴在字段底边框上的横向分隔条：横向语义与 ArrowUp/Down 对应
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
    expect(handle.getAttribute("aria-valuemin")).toBe(
      String(MIN_RESIZE_HEIGHT)
    );
    // 未受控态：实测自动高度作为 aria-valuenow（ARIA 1.2 focusable separator
    // MUST set aria-valuenow）。jsdom 无 ResizeObserver，测量 effect 只在挂载
    // 与 window resize 时重跑，故 stub offsetHeight 后须显式派发 resize 重测。
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(handle.getAttribute("aria-valuenow")).toBe("100");

    // W3C Window Splitter 语义（上方文本框为主区域）：
    // ArrowDown：增加高度（从测量基线 100 增加一个步进 12px → 112px）
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(textField.style.height).toBe(`${100 + KEYBOARD_RESIZE_STEP}px`);
    // 持有受控高度后 valuenow 输出真实值
    expect(handle.getAttribute("aria-valuenow")).toBe(
      String(100 + KEYBOARD_RESIZE_STEP)
    );

    // ArrowUp：以受控高度为基线递减一个步进（112 - 12 = 100px）
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(textField.style.height).toBe("100px");

    // 连续 ArrowUp 触底：不得低于 MIN_RESIZE_HEIGHT
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        handle.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowUp",
            bubbles: true,
            cancelable: true,
          })
        );
        await Promise.resolve();
      });
    }
    expect(textField.style.height).toBe(`${MIN_RESIZE_HEIGHT}px`);

    // 非方向键不触发调整
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(textField.style.height).toBe(`${MIN_RESIZE_HEIGHT}px`);

    act(() => root.unmount());
  });

  test("omits aria-valuenow when no measured height is available", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    // jsdom offsetHeight=0 且未 stub：按硬红线省略 valuenow，不得写 aria-valuenow="0"
    // （0 与非有限值一律省略，宁缺勿造）
    expect(handle.getAttribute("aria-valuenow")).toBeNull();

    act(() => root.unmount());
  });

  test("tabbing focus to the handle keeps the field open (relatedTarget keep-alive)", async () => {
    const { container, root, input } = await renderFocusedForm();
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 焦点从 textarea 迁移到手柄（Tab 等价场景）：focusout 冒泡到字段包装层，
    // relatedTarget 在包装层内 → 不关闭、不卸载，reduced-motion 用户也能
    // Tab 进手柄/按钮进行键盘操作
    await act(async () => {
      handle.focus();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(handle);
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).not.toBeNull();
    // rail 同样保持挂载（字段未关闭）
    expect(
      container.querySelector('[data-testid="tranform-rail"]')
    ).not.toBeNull();
    // 字段未进入关闭动画
    expect(handle.style.pointerEvents).toBe("auto");

    act(() => root.unmount());
  });

  test("blurring the handle with no related target still closes the field", async () => {
    const { container, root, input } = await renderFocusedForm();
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 先 Tab 进手柄（保活路径），再无目标失焦：必须正常走关闭分支
    await act(async () => {
      handle.focus();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).not.toBeNull();

    await act(async () => {
      handle.blur();
      await Promise.resolve();
    });
    // 退出动画 120ms 后手柄与 rail 卸载
    await act(async () => {
      await new Promise((r) => setTimeout(r, 130));
    });
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).toBeNull();
    expect(container.querySelector('[data-testid="tranform-rail"]')).toBeNull();

    act(() => root.unmount());
  });

  test("pointercancel and window blur terminate an active drag session", async () => {
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // pointercancel（如系统手势接管指针）终止会话：后续移动不再改变高度
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 30 }));
    });
    expect(textField.style.height).toBe("130px");
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointercancel", { clientY: 30 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 60 }));
    });
    expect(textField.style.height).toBe("130px");

    // window blur（浏览器窗口失焦）终止会话：第二轮以 130px 为基线，
    // 移动 25px 达到 155px 后失焦，后续移动不再改变高度
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 25 }));
    });
    expect(textField.style.height).toBe("155px");
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 70 }));
    });
    expect(textField.style.height).toBe("155px");

    act(() => root.unmount());
  });

  test("a matching lostpointercapture terminates an element-captured pointer session", async () => {
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 启用元素 capture 主路径：hasPointerCapture 返回 true
    HTMLElement.prototype.setPointerCapture = jest.fn(function () {
      return true;
    });
    HTMLElement.prototype.hasPointerCapture = jest.fn(function () {
      return true;
    });
    try {
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      });
      // 元素会话：移动直接在句柄元素上派发（window 降级监听不参与）
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
      });
      expect(textField.style.height).toBe("120px");

      // gotpointercapture 确认元素接管（撤除 window fallback）
      await act(async () => {
        handle.dispatchEvent(
          makePointerEvent("gotpointercapture", { clientY: 0 })
        );
      });

      // 匹配的 lostpointercapture：元素会话终止，后续移动不再改变高度
      await act(async () => {
        handle.dispatchEvent(
          makePointerEvent("lostpointercapture", { clientY: 20 })
        );
      });
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointermove", { clientY: 60 }));
      });
      expect(textField.style.height).toBe("120px");
    } finally {
      delete HTMLElement.prototype.hasPointerCapture;
      delete HTMLElement.prototype.setPointerCapture;
    }

    act(() => root.unmount());
  });

  test("capture failure activates the window fallback and gotpointercapture deactivates it", async () => {
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // capture 失败：setPointerCapture 缺失 → window fallback 同步激活
    HTMLElement.prototype.setPointerCapture = undefined;
    HTMLElement.prototype.hasPointerCapture = undefined;
    try {
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      });
      // window 承接 move 仍可调高（拖出元素仍有效）
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 30 }));
      });
      expect(textField.style.height).toBe("130px");

      // gotpointercapture 确认元素接管：撤除 window fallback，此后 window move
      // 不得再次改高度（防双写）
      await act(async () => {
        handle.dispatchEvent(
          makePointerEvent("gotpointercapture", { clientY: 0 })
        );
      });
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 40 }));
      });
      expect(textField.style.height).toBe("130px");

      // 元素路径的 pointerup 结束会话
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointerup", { clientY: 40 }));
      });
    } finally {
      delete HTMLElement.prototype.hasPointerCapture;
      delete HTMLElement.prototype.setPointerCapture;
    }

    act(() => root.unmount());
  });

  test("immediate matching pointerup/pointercancel after pointerdown still ends the session", async () => {
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 立即 pointerup：即使尚无任何状态驱动 effect 重渲染，也必须结束会话并允许下一次 pointerdown
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 0 }));
    });
    // 新一轮会话以 130px 为基线（上一轮未改变高度，仍从 100 起）
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 30 }));
    });
    expect(textField.style.height).toBe("130px");

    act(() => root.unmount());
  });

  test("touch start binds the handle's new finger even when an older finger is already on screen", async () => {
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 屏幕已有旧手指 identifier=2（排在最前），手柄新手指 identifier=1 随后按下：
    // 必须绑定 changedTouches[0] 的手柄新触点，而不是 touches[0] 的旧手指。
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent(
          "touchstart",
          [
            { clientY: 0, identifier: 2 },
            { clientY: 0, identifier: 1 },
          ],
          {
            // touchstart 的结算清单是本次新按下/变更的触点：id=1 是手柄新手指
            changedTouches: [{ clientY: 0, identifier: 1 }],
          }
        )
      );
    });
    // 按 identifier=1 跟踪：移动到 30 → 130px（旧手指 id=2 排最前移动也无效）
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [
          { clientY: 90, identifier: 2 },
          { clientY: 30, identifier: 1 },
        ])
      );
    });
    expect(textField.style.height).toBe("130px");

    // 非发起触点（identifier=2）抬起：changedTouches 结算 id=2，
    // 但发起触点 id=1 仍在当前 touches 中，不得结束会话
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [{ clientY: 30, identifier: 1 }], {
          changedTouches: [{ identifier: 2 }],
        })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchmove", [{ clientY: 50, identifier: 1 }])
      );
    });
    expect(textField.style.height).toBe("150px");

    // 发起触点（identifier=1）抬起结束会话
    await act(async () => {
      window.dispatchEvent(
        makeTouchEvent("touchend", [], {
          changedTouches: [{ identifier: 1 }],
        })
      );
    });

    act(() => root.unmount());
  });

  test("controlled height is re-clamped once when the viewport shrinks and is not revived", async () => {
    // 初始视口足够高（2000），允许拖出 900px 的受控高度
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2000,
    });
    const { container, root } = await renderFocusedForm();
    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 700,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 建立一个 900px 的受控高度（700 + 200）
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 200 }));
    });
    expect(textField.style.height).toBe("900px");

    // 视口缩小到 500：上界收紧到 < 900，一次性重 clamp
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(parseInt(textField.style.height, 10)).toBeLessThan(900);
    // aria-valuemax 不得反转：始终 >= valuemin (40)
    const valuemax = parseInt(handle.getAttribute("aria-valuemax"), 10);
    const valuemin = parseInt(handle.getAttribute("aria-valuemin"), 10);
    expect(valuemax).toBeGreaterThanOrEqual(valuemin);
    expect(valuemax).toBeLessThan(900);

    // 视口恢复：被截断的旧高度不得自动复活
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2000,
    });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(parseInt(textField.style.height, 10)).toBeLessThan(900);

    act(() => root.unmount());
  });

  test("keeps dragging when the textarea blurs mid-drag until pointerup", async () => {
    const { container, root, input } = await renderFocusedForm();
    const textField = input.closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 进入拖动会话并移动超过阈值
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    expect(textField.style.height).toBe("120px");

    // 缩放中途失焦：进入退出动画，但活动会话期间手柄保持挂载与监听
    act(() => {
      input.blur();
    });
    // 退出动画期间（closing=true）拖动不受 pointer-events 阻断
    expect(handle.style.pointerEvents).toBe("auto");

    // 等待超过 120ms 退出动画：失焦不再终止会话（新契约）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 130));
    });
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).not.toBeNull();

    // 失焦后 height 仍在跟随鼠标
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 40 }));
    });
    expect(textField.style.height).toBe("140px");

    // 松手结束会话：重渲染后按新门控自然卸载
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 40 }));
    });
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).toBeNull();

    // 后续 pointermove 不再改变高度
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 60 }));
    });
    expect(textField.style.height).toBe("140px");

    act(() => root.unmount());
  });

  test("unmounts the handle and ignores pointer moves when blur happens without a drag session", async () => {
    const { container, root, input } = await renderFocusedForm();
    const textField = input.closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });

    // 从未进入拖动会话：失焦后按旧契约卸载，且后续指针移动无效
    // （无监听器响应，等价于"监听器已移除"的功能性断言）。
    act(() => {
      input.blur();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 130));
    });
    expect(
      container.querySelector('[data-testid="tranform-resize-handle"]')
    ).toBeNull();
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
    });
    expect(textField.style.height).toBe("");

    act(() => root.unmount());
  });

  test("prevents default on compatible mousedown to guard textarea focus", async () => {
    const { container, root } = await renderFocusedForm();
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 兼容 mousedown 必须被 preventDefault 抑制（防失焦兜底，与提交按钮/
    // CopyBtn 同一套先例），且 mousedown 本身不是拖动会话入口。
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      handle.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    act(() => root.unmount());
  });

  test("keeps resizing after instant blur when prefers-reduced-motion is enabled", async () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = matchMediaStub(true);
      const { container, root, input } = await renderFocusedForm();
      const textField = input.closest(".MuiInputBase-root");
      Object.defineProperty(textField, "offsetHeight", {
        configurable: true,
        value: 100,
      });
      const handle = container.querySelector(
        '[data-testid="tranform-resize-handle"]'
      );

      // 进入拖动会话并移动超过阈值
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      });
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
      });
      expect(textField.style.height).toBe("120px");

      // 减少动态效果：失焦跳过退出动画立即翻转 visible，活动会话必须存活
      act(() => {
        input.blur();
      });
      // 拖动继续：高度仍在跟随，且不被 pointer-events 阻断
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
      });
      expect(textField.style.height).toBe("150px");
      expect(handle.style.pointerEvents).not.toBe("none");

      // 松手结束会话：按新门控卸载；后续移动不再改变高度
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointerup", { clientY: 50 }));
      });
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 80 }));
      });
      expect(textField.style.height).toBe("150px");

      act(() => root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("reads prefers-reduced-motion and subscribes/unsubscribes to runtime changes", async () => {
    // 模拟系统开启"减少动态效果"：matchMedia 返回 matches=true。
    // 验证 hook 在组件挂载时读取真实偏好并注册 change 订阅，卸载时移除订阅。
    const originalMatchMedia = window.matchMedia;
    const changeHandlers = [];
    const removeFn = jest.fn();
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
      addEventListener: (type, handler) => {
        if (type === "change") changeHandlers.push(handler);
      },
      removeEventListener: removeFn,
    };
    window.matchMedia = jest.fn().mockReturnValue(mql);

    try {
      const { container, root } = renderTranForm({
        text: "hello",
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      // focus-gating：聚焦后右上操作组才显示（编辑态显示提交按钮）
      act(() => {
        container.querySelector("textarea").focus();
      });

      // 组件确以"减少动态效果"媒体查询读取系统偏好
      expect(window.matchMedia).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)"
      );
      // TranForm 唯一注册运行时订阅：ResizeHandle 改由 prop 接收偏好值，
      // 不再内部重复订阅（单一状态真源）。
      expect(changeHandlers.length).toBe(1);

      // 偏好从还原为不还原时，订阅处理器会同步更新组件状态（不抛错）
      act(() => {
        changeHandlers[0]({ matches: false });
      });
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();

      // 卸载时移除 change 订阅
      act(() => root.unmount());
      expect(removeFn).toHaveBeenCalledWith("change", expect.any(Function));
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("the resize handle relies on a single reduced-motion mechanism (no duplicate @media rules)", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    expect(handle).not.toBeNull();
    const handleClasses = (handle.className || "").split(" ").filter(Boolean);

    // ResizeHandle 的过渡样式由 usePrefersReducedMotion hook 唯一驱动：
    // 不得残留 "@media (prefers-reduced-motion: reduce)" 的第二套 CSS 机制
    const ownMediaRules = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    });
    expect(
      ownMediaRules.filter(
        (rule) =>
          rule.type === CSSRule.MEDIA_RULE &&
          /prefers-reduced-motion/.test(rule.media?.mediaText || "") &&
          Array.from(rule.cssRules).some(
            (inner) =>
              inner.selectorText &&
              handleClasses.some((c) =>
                inner.selectorText
                  .split(",")
                  .some((sel) => sel.trim() === `.${c}`)
              )
          )
      ).length
    ).toBe(0);

    act(() => root.unmount());
  });

  test("does not inject the enter animation when prefers-reduced-motion is enabled", async () => {
    const originalMatchMedia = window.matchMedia;

    // 依次渲染"不减少动态效果"与"减少动态效果"两种实例，
    // 并各自检查其控制组的样式规则是否引用了进入动画关键帧。
    // 只按元素自身生成的类名过滤规则，避免其他实例残留样式干扰断言。
    try {
      const matchMediaStub = (matches) =>
        jest.fn().mockReturnValue({
          matches,
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          addListener: jest.fn(),
          removeListener: jest.fn(),
          dispatchEvent: jest.fn(),
        });

      // 未开启减少动态效果：进入动画关键帧应注入
      window.matchMedia = matchMediaStub(false);
      const normal = renderTranForm({
        text: "hello",
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      act(() => {
        normal.container.querySelector("textarea").focus();
      });
      const normalCopy = normal.container.querySelector(
        '[aria-label="Submit"]'
      );
      const normalStack = normalCopy.parentElement;
      const normalClasses = (normalStack.className || "")
        .split(" ")
        .filter(Boolean);
      const normalRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const normalOwnAnimations = normalRules.filter(
        (rule) =>
          rule.selectorText &&
          normalClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(normalOwnAnimations.length).toBeGreaterThan(0);
      act(() => normal.root.unmount());

      // 开启减少动态效果：该实例的控制组不得注入进入动画关键帧
      window.matchMedia = matchMediaStub(true);
      const reduced = renderTranForm({
        text: "hello",
        simpleStyle: false,
        autoFocusInput: false,
      });
      await flushEffects();
      act(() => {
        reduced.container.querySelector("textarea").focus();
      });
      const reducedCopy = reduced.container.querySelector(
        '[aria-label="Submit"]'
      );
      const reducedStack = reducedCopy.parentElement;
      const reducedClasses = (reducedStack.className || "")
        .split(" ")
        .filter(Boolean);
      const reducedOwnAnimations = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return [];
          }
        })
        .filter(
          (rule) =>
            rule.selectorText &&
            reducedClasses.some((c) =>
              rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
            ) &&
            /transition[^;]*opacity/.test(rule.cssText)
        );
      expect(reducedOwnAnimations.length).toBe(0);

      act(() => reduced.root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe("TranForm embedded border controls", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  /**
   * 渲染原文输入框并使其聚焦：focus-gating 下操作 rail 与缩放手柄只在聚焦时显示。
   *
   * @param {Object} props 覆盖默认组件参数（默认 text="hello"）。
   * @returns {{container: HTMLElement, root: Object, input: HTMLTextAreaElement}} 渲染结果与 textarea。
   */
  async function renderFocusedForm(props = {}) {
    const rendered = renderTranForm({
      text: "hello",
      simpleStyle: false,
      autoFocusInput: false,
      ...props,
    });
    await flushEffects();
    const input = rendered.container.querySelector("textarea");
    act(() => {
      input.focus();
    });
    return { ...rendered, input };
  }

  /**
   * 使用原生 value setter 修改受控 textarea 的值并触发 React onChange。
   *
   * @param {HTMLTextAreaElement} input textarea 元素。
   * @param {string} value 新值。
   */
  function changeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    ).set;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  /**
   * 收集当前 document.styleSheets 中所有 CSS 规则。
   *
   * @returns {Array<CSSRule>} 全部规则（跨源样式表读取失败时跳过）。
   */
  function collectRules() {
    return Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    });
  }

  test("resize handle and rail are not shielded by the overlay pointer-events none", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    const rail = container.querySelector('[data-testid="tranform-rail"]');
    expect(handle).not.toBeNull();
    expect(rail).not.toBeNull();

    // 覆盖层父级显式 pointer-events: none，控件自身必须内联覆盖为 auto，
    // 使 jsdom 能读取到该样式，浏览器中也不会被父层屏蔽而无法接收指针事件。
    expect(getComputedStyle(handle).pointerEvents).toBe("auto");
    expect(getComputedStyle(rail).pointerEvents).toBe("auto");
    expect(getComputedStyle(handle).cursor).toBe("row-resize");

    act(() => root.unmount());
  });

  test("anchors the resize handle centered on the bottom border", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    expect(handle).not.toBeNull();

    // 跨底边框居中：共享中心轴距右边缘 12px，热区宽 16，中心偏移 8
    expect(parseFloat(handle.style.right)).toBe(CONTROL_CENTER_FROM_RIGHT - 8);
    expect(parseFloat(handle.style.bottom)).toBe(-8);
    // jsdom 下桌面命中热区 = 16
    expect(parseFloat(handle.style.width)).toBe(16);
    expect(parseFloat(handle.style.height)).toBe(16);

    act(() => root.unmount());
  });

  test("rail and handle share the same right center axis", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    const rail = container.querySelector('[data-testid="tranform-rail"]');

    // 右上 rail 与缩放手柄均以共享中心轴定位：中心 = right + 自身宽度/2 = CONTROL_CENTER_FROM_RIGHT
    const railCenter = parseFloat(rail.style.right) + CONTROL_HEIGHT / 2;
    expect(railCenter).toBe(CONTROL_CENTER_FROM_RIGHT);

    // rail 以顶边为中心垂直居中：top = -CONTROL_HEIGHT/2，中心落在边框线 y=0
    expect(parseFloat(rail.style.top)).toBe(-Math.round(CONTROL_HEIGHT / 2));
    expect(parseFloat(rail.style.top) + CONTROL_HEIGHT / 2).toBe(0);

    // 手柄同样以共享中心轴定位（跨底边框居中）
    const handleCenter =
      parseFloat(handle.style.right) + parseFloat(handle.style.width) / 2;
    expect(handleCenter).toBe(CONTROL_CENTER_FROM_RIGHT);

    act(() => root.unmount());
  });

  test("rail and handle both have notch strips", async () => {
    const { container, root } = await renderFocusedForm();

    const railNotch = container.querySelector(
      '[data-testid="tranform-rail-notch"]'
    );
    expect(railNotch).not.toBeNull();
    const resizeNotch = container.querySelector(
      '[data-testid="tranform-resize-notch"]'
    );
    expect(resizeNotch).not.toBeNull();

    // rail 遮罩 top 在顶边框线，宽度 = 控件宽度 + 两侧水平 padding
    expect(parseFloat(railNotch.style.top)).toBe(
      -Math.round(NOTCH_STRIP_HEIGHT / 2)
    );
    expect(parseFloat(railNotch.style.width)).toBe(
      CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2
    );

    // 缩放手柄遮罩 bottom 在底边框线，宽度 = 控件宽度 + 两侧水平 padding
    expect(parseFloat(resizeNotch.style.bottom)).toBe(
      -Math.round(NOTCH_STRIP_HEIGHT / 2)
    );
    expect(parseFloat(resizeNotch.style.width)).toBe(
      CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2
    );

    // 两个遮罩条均以 background.paper 主题色遮盖边框
    const rules = collectRules();
    const notchPairs = [
      (railNotch.className || "").split(" ").filter(Boolean),
      (resizeNotch.className || "").split(" ").filter(Boolean),
    ];
    notchPairs.forEach((classes) => {
      const ownRules = rules.filter(
        (rule) =>
          rule.selectorText &&
          classes.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          rule.cssText.includes("background-color")
      );
      expect(ownRules.length).toBeGreaterThan(0);
      expect(
        ownRules.every((rule) => !rule.cssText.includes("background.paper"))
      ).toBe(true);
    });

    act(() => root.unmount());
  });

  test("renders the DragIndicatorIcon inside the resize handle", async () => {
    const { container, root } = await renderFocusedForm();

    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );
    expect(handle).not.toBeNull();
    // 六点 DragIndicator 图标渲染在手柄热区内
    expect(
      handle.querySelector('[data-testid="DragIndicatorIcon"]')
    ).not.toBeNull();

    // 不再使用 ::before 折角画线：styleSheets 中不应存在该伪元素的规则
    const handleClasses = (handle.className || "").split(" ").filter(Boolean);
    const ownBeforeRules = collectRules().filter(
      (rule) =>
        rule.selectorText &&
        handleClasses.some((c) =>
          rule.selectorText
            .split(",")
            .some((sel) => sel.trim() === `.${c}::before`)
        )
    );
    expect(ownBeforeRules.length).toBe(0);

    act(() => root.unmount());
  });

  test("hidden state leaves no rail, handle or notch in the DOM", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root, input } = await renderFocusedForm();

      // 失焦：缩放手柄与 rail-notch 同构，均播放退出动画后卸载（不再瞬时卸载）
      act(() => {
        input.blur();
      });
      // 退出动画期间缩放手柄与 rail-notch 仍在 DOM（淡出中）
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-notch"]')
      ).not.toBeNull();

      // 退出动画期间 rail 与 notch 仍在 DOM
      expect(
        container.querySelector('[data-testid="tranform-rail"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-rail-notch"]')
      ).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        container.querySelector('[data-testid="tranform-rail"]')
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-rail-notch"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("plays the rail exit animation on blur and unmounts after 120ms", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root, input } = await renderFocusedForm();

      act(() => {
        input.blur();
      });

      // 退出动画期间 rail 仍在 DOM，且注入 opacity/visibility 过渡规则。
      // 注意：closing 翻转会使 rail 的 emotion 类名变化，须在 blur 后重新取类名过滤。
      const rail = container.querySelector('[data-testid="tranform-rail"]');
      expect(rail).not.toBeNull();
      const railClasses = (rail.className || "").split(" ").filter(Boolean);
      const ownOutAnimations = collectRules().filter(
        (rule) =>
          rule.selectorText &&
          railClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(ownOutAnimations.length).toBeGreaterThan(0);

      // 缩放手柄同构：失焦后参与退出动画（淡出中仍在 DOM），退出期间禁用命中
      const exitHandle = container.querySelector(
        '[data-testid="tranform-resize-handle"]'
      );
      expect(exitHandle).not.toBeNull();
      expect(getComputedStyle(exitHandle).pointerEvents).toBe("none");

      // 退出动画期间 rail 屏蔽指针事件，防止残留按钮被点击触发提交/复制
      expect(
        getComputedStyle(
          container.querySelector('[data-testid="tranform-rail"]')
        ).pointerEvents
      ).toBe("none");

      // 120ms 后 rail 与缩放手柄均卸载
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        container.querySelector('[data-testid="tranform-rail"]')
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="tranform-resize-handle"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("removes the rail immediately on blur without exit animation when prefers-reduced-motion is enabled", async () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = matchMediaStub(true);
      const { container, root, input } = await renderFocusedForm();
      const rail = container.querySelector('[data-testid="tranform-rail"]');
      const railClasses = (rail.className || "").split(" ").filter(Boolean);

      act(() => {
        input.blur();
      });

      // reduced-motion：跳过 120ms 滞留，立即卸载
      expect(
        container.querySelector('[data-testid="tranform-rail"]')
      ).toBeNull();

      // 未注入 opacity/visibility 退出过渡（reduced-motion 下 transition: none）
      const ownOutAnimations = collectRules().filter(
        (rule) =>
          rule.selectorText &&
          railClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(ownOutAnimations.length).toBe(0);

      act(() => root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("keeps the submit button in the rail during the exit animation after blurring while editing", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root, input } = await renderFocusedForm();
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();

      act(() => {
        input.blur();
      });

      // closing 期间 editMode 保持失焦前值：rail 仍显示正在淡出的提交按钮（非被替换为 copy）
      expect(container.querySelector('[aria-label="Submit"]')).not.toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(container.querySelector('[aria-label="Submit"]')).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("keeps the copy button in the rail during the exit animation after blurring while not editing", async () => {
    jest.useFakeTimers("legacy");
    try {
      let committed = "hello";
      const setText = jest.fn().mockImplementation((next) => {
        committed = next;
      });
      const { container, root, input } = await renderFocusedForm({ setText });

      // 提交退出编辑态（mousedown 阻止失焦，焦点保留在 textarea 上）
      changeInputValue(input, "hello");
      const submit = container.querySelector('[aria-label="Submit"]');
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      act(() => {
        root.render(
          <TranForm
            text={committed}
            setText={setText}
            apiSlugs={[]}
            fromLang="en"
            toLang="zh-CN"
            toLang2="-"
            transApis={[]}
            simpleStyle={false}
            autoFocusInput={false}
            langDetector="-"
            enDict="Bing"
            enSug="-"
            aiDictApiSlug="-"
          />
        );
      });
      await flushEffects();

      // 复制态：rail 显示 copy 按钮
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(true);

      act(() => {
        input.blur();
      });

      // closing 期间 rail 仍显示正在淡出的 copy 按钮
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(true);

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "copy"
        )
      ).toBe(false);

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
   * @param {string} type 事件类型（如 pointerdown/pointermove）。
   * @param {Object} opts 可选的 clientY 与 pointerId。
   * @returns {Event} 可被 React 与 jsdom 识别的指针事件。
   */
  function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  }

  /**
   * 解析真实浏览器级联下 fieldset 的 border-width。
   *
   * jsdom 的级联按样式表文档顺序解析而不是按选择器特异性，而 emotion 把每条
   * 规则注入到独立的 <style> 标签，标签顺序随挂载顺序变化（同一 DOM 在不同
   * 测试文件里的计算值可能不同）。这里取"实际匹配该元素且类数量最多"的选择器
   * 所声明的 border-width，模拟浏览器的特异性级联，可靠断言聚焦边框宽度。
   *
   * @param {HTMLElement} outline .MuiOutlinedInput-notchedOutline 元素。
   * @returns {string} 胜者规则中声明的 border-width（如 "1px" / "2px"）。
   */
  function winningBorderWidth(outline) {
    const matched = collectRules()
      .filter((rule) => rule.selectorText && /border-width/.test(rule.cssText))
      .map((rule) => ({
        rule,
        selectors: rule.selectorText.split(",").map((s) => s.trim()),
      }))
      .filter(({ selectors }) => selectors.some((sel) => outline.matches(sel)))
      .map(({ rule, selectors }) => ({
        rule,
        classCount: Math.max(
          ...selectors.map(
            (sel) => (sel.match(/\.-?[_a-zA-Z][\w-]*/g) || []).length
          )
        ),
      }))
      .sort((a, b) => b.classCount - a.classCount)[0];
    expect(matched).toBeDefined();
    return /border-width:\s*([^;]+)/.exec(matched.rule.cssText)?.[1]?.trim();
  }

  test("keeps the focused notched outline at 2px border width", async () => {
    const { container, root } = await renderFocusedForm();

    const focusedOutline = container.querySelector(
      ".MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline"
    );
    expect(focusedOutline).not.toBeNull();
    // 保留 MUI 原生 2px 聚焦边框（键盘焦点可见性，WCAG 2.4.7）；装饰缺口由
    // NOTCH_STRIP_HEIGHT=4 的遮罩条把两层边框一起清掉，不再用字段局部样式压制。
    expect(winningBorderWidth(focusedOutline)).toBe("2px");

    act(() => root.unmount());
  });

  test("keeps rail, handle and notches outside the scrollable input root after a drag", async () => {
    const { container, root } = await renderFocusedForm();

    const textField = container
      .querySelector("textarea")
      .closest(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="tranform-resize-handle"]'
    );

    // 完成一次超过 6px 阈值的高度拖动，使 resizeHeight 进入受控状态
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    // 受控高度已接管 InputBase 根节点；根节点不持有受控 overflowY
    // （jsdom/cssstyle 不展开 overflow shorthand，且 MUI TextareaAutosize 会
    // 每帧重写 textarea.style.overflow——root 级 overflowY 会让可见 textarea
    // 无法成为唯一滚动容器）
    expect(textField.style.height).toBe("120px");
    expect(textField.style.overflowY).toBe("");

    // rail、六点手柄与两处 notch 必须与滚动根节点同级（或其外层），
    // 祖先链不得包含该滚动节点，否则会被 overflow-y: auto 裁切。
    for (const testId of [
      "tranform-rail",
      "tranform-resize-handle",
      "tranform-resize-notch",
    ]) {
      const node = container.querySelector(`[data-testid="${testId}"]`);
      expect(node).not.toBeNull();
      expect(node.closest(".MuiInputBase-root")).toBeNull();
    }

    act(() => root.unmount());
  });
});
