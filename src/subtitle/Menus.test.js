import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SUBTITLE_SETTING } from "../config";
import { Menus } from "./Menus";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderMenus({
  apiSlug = "api-a",
  autoTranslate = true,
  updateSetting = jest.fn(),
  transApis = [],
  ...props
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <Menus
        i18n={(key) => key}
        formData={{
          apiSlug,
          segSlug: "-",
          skipAd: false,
          isBilingual: true,
          blurTranslation: false,
          autoTranslate,
          aiContextSlug: "-",
        }}
        updateSetting={updateSetting}
        downloadSubtitle={jest.fn()}
        transApis={transApis}
        {...props}
      />
    );
  });

  return {
    container,
    updateSetting,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("subtitle Menus", () => {
  test.each([true, false])(
    "ASR and translation switches share row styling when autoTranslate=%s",
    (autoTranslate) => {
      const view = renderMenus({
        autoTranslate,
        asr: { active: false, available: true },
        asrActions: {},
      });
      const buttons = [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')];
      const translation = buttons.find(
        (item) => item.textContent === "enable_subtitle_translate"
      );
      const asr = buttons.find(
        (item) => item.textContent === "youtube_asr_start"
      );
      expect(asr.parentElement).toBe(translation.parentElement);
      for (const key of ["display", "padding", "justifyContent", "alignItems"])
        expect(asr.style[key]).toBe(translation.style[key]);
      const track = (row) => row.querySelector('div[style*="width: 52px"]');
      for (const key of ["width", "height", "borderRadius"])
        expect(track(asr).style[key]).toBe(track(translation).style[key]);
      // 轨道是行内 flex 子元素：长标签挤压时 52x32 几何必须保持（不收缩）。
      for (const row of [translation, asr])
        expect(row.querySelector('div[style*="width: 52px"]').style.flexShrink).toBe(
          "0"
        );
      expect(asr.getAttribute("aria-disabled")).toBe(String(!autoTranslate));
      // 开关行位于本套件根节点的 role="dialog" 面板内，非菜单面：语义按 ARIA switch
      // 承载，状态仍由 aria-checked 同步；不得回退成 menuitemcheckbox
      // （那是 role="menu" 内可勾选项的专用角色）。
      expect(translation.getAttribute("role")).toBe("switch");
      expect(asr.getAttribute("role")).toBe("switch");
      expect(translation.getAttribute("aria-checked")).toBe(
        String(autoTranslate)
      );
      expect(asr.getAttribute("aria-checked")).toBe("false");
      // T3：注入样式块补 hover 中性叠色（白 8%，非 accent），
      // 触屏 tap 残留由 hover:hover 媒体查询包裹防驻留。
      const injectedStyle = [...view.container.querySelectorAll("style")]
        .map((node) => node.textContent)
        .join("");
      expect(injectedStyle).toContain("@media (hover: hover)");
      expect(injectedStyle).toContain(
        '[role="button"]:not([aria-disabled="true"]):hover'
      );
      expect(injectedStyle).toContain('[role="option"]:hover');
      expect(injectedStyle).toContain('[role="menuitemcheckbox"]:hover');
      expect(injectedStyle).toContain('[role="switch"]:hover');
      expect(injectedStyle).toContain(
        '[data-kt-focus-silent="true"][role="switch"]:focus-visible'
      );
      expect(injectedStyle).toContain(
        '.kt-subtitle-menus [role="switch"]:focus-visible{outline: 3px solid'
      );
      expect(injectedStyle).toContain("background: rgba(255,255,255,.08)");
      view.cleanup();
    }
  );
  test("audio-block results disable segmentation without putting guidance in the menu", () => {
    const view = renderMenus({
      transApis: [{ apiSlug: "ai", apiName: "AI", apiType: "OpenAI" }],
      formData: {
        segSlug: "ai",
        apiSlug: "ai",
        autoTranslate: true,
        aiContextSlug: "ai",
      },
      asr: {
        available: true,
        active: true,
        phase: "complete",
        timingSource: "audio-chunk",
      },
      asrActions: {},
    });
    const controls = [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')];
    const segmentation = controls.find((item) =>
      item.textContent.startsWith("ai_segmentation")
    );
    expect(segmentation.getAttribute("aria-disabled")).toBe("true");
    expect(segmentation.textContent).toContain("AI");
    act(() => segmentation.click());
    expect(view.updateSetting).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain(
      "youtube_asr_chunk_timing_hint"
    );
    view.cleanup();
  });

  test("disabled rows resolve to a literal background, not a dead token", () => {
    // --kt-submenu-disabled 全仓无定义点，禁用行底色必须是
    // 可直接解析的字面量，不得残留 var() 包装。
    const view = renderMenus({
      transApis: [{ apiSlug: "ai", apiName: "AI", apiType: "OpenAI" }],
      formData: {
        segSlug: "ai",
        apiSlug: "ai",
        autoTranslate: true,
        aiContextSlug: "ai",
      },
      asr: {
        available: true,
        active: true,
        phase: "complete",
        timingSource: "audio-chunk",
      },
      asrActions: {},
    });
    const controls = [
      ...view.container.querySelectorAll(
        '[role="button"], [role="menuitemcheckbox"], [role="switch"]'
      ),
    ];
    const segmentation = controls.find((item) =>
      item.textContent.startsWith("ai_segmentation")
    );
    expect(segmentation.style.background).not.toContain("var(");
    expect(segmentation.style.background).toBe("rgba(255, 255, 255, 0.12)");
    view.cleanup();
  });
  test("unconfigured ASR keeps only the disabled toggle", () => {
    const start = jest.fn(),
      configure = jest.fn();
    const view = renderMenus({
      asr: { available: false, active: false },
      asrActions: { start, configure },
    });
    const button = (text) =>
      [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')].find(
        (item) => item.textContent === text
      );
    expect(button("youtube_asr_start").getAttribute("aria-disabled")).toBe(
      "true"
    );
    expect(view.container.textContent).not.toContain(
      "youtube_asr_setup_required"
    );
    act(() => button("youtube_asr_start").click());
    expect(start).not.toHaveBeenCalled();
    expect(button("youtube_asr_configure")).toBeUndefined();
    expect(configure).not.toHaveBeenCalled();
    view.cleanup();
  });
  test.each([false, true])(
    "configured ASR toggle switches the current video when active=%s",
    (active) => {
      const start = jest.fn(),
        stop = jest.fn();
      const view = renderMenus({
        asr: { available: true, active, phase: "cached" },
        asrActions: { start, stop },
      });
      const toggle = [
        ...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]'),
      ].find((item) => item.textContent === "youtube_asr_start");
      act(() => toggle.click());
      expect(active ? stop : start).toHaveBeenCalledTimes(1);
      view.cleanup();
    }
  );
  test("ASR removes cache deletion, status and recovery controls", () => {
    const retryRecognition = jest.fn(),
      retryTranslation = jest.fn();
    const view = renderMenus({
      acquisition: { phase: "error" },
      asr: {
        available: true,
        active: true,
        phase: "partial",
        recognitionError: "ASR_FAILED",
        translationError: "TRANSLATION_FAILED",
        audio: { phase: "missing" },
        recognition: { percent: 50, samples: 16000, totalSamples: 32000 },
        translation: { percent: 25, samples: 8000, totalSamples: 32000 },
      },
      asrActions: {
        stop: jest.fn(),
        retryRecognition,
        retryTranslation,
        reRecognize: jest.fn(),
        deleteCache: jest.fn(),
      },
    });
    const button = (label) =>
      [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')].find(
        (item) => item.textContent === label
      );
    expect(view.container.textContent).not.toMatch(/50%|25%/);
    for (const key of [
      "youtube_caption_retry",
      "youtube_asr_retry",
      "youtube_caption_retry_translation",
      "youtube_asr_redo",
      "youtube_asr_save",
      "youtube_asr_delete",
    ])
      expect(button(key)).toBeUndefined();
    expect(retryRecognition).not.toHaveBeenCalled();
    expect(retryTranslation).not.toHaveBeenCalled();
    view.cleanup();
  });
  test("keeps immediate translation enabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoTranslate).toBe(true);
  });

  test("keeps automatic subtitle word favorites disabled by default", () => {
    expect(DEFAULT_SUBTITLE_SETTING.autoFavWord).toBe(false);
  });

  test("renders translation first and updates the current video state", () => {
    const view = renderMenus({ autoTranslate: false });
    const label = Array.from(view.container.querySelectorAll("div")).find(
      (element) =>
        element.textContent === "enable_subtitle_translate" &&
        element.children.length === 0
    );

    expect(
      view.container.textContent.startsWith("enable_subtitle_translate")
    ).toBe(true);

    act(() => {
      label.parentElement.click();
    });

    expect(view.updateSetting).toHaveBeenCalledWith({
      name: "autoTranslate",
      value: true,
    });
    view.cleanup();
  });

  test("renders enabled translation services immediately after the toggle", () => {
    const view = renderMenus({
      transApis: [
        { apiSlug: "api-a", apiName: "API A", apiType: "builtin" },
        { apiSlug: "api-b", apiName: "API B", apiType: "builtin" },
        {
          apiSlug: "api-disabled",
          apiName: "Disabled API",
          apiType: "builtin",
          isDisabled: true,
        },
      ],
    });
    const menuItems = view.container.firstElementChild.children;

    expect(menuItems[0].textContent).toContain("enable_subtitle_translate");
    expect(menuItems[1].textContent).toContain("translate_service");
    expect(menuItems[2].textContent).toContain("terminology_tables");
    expect(menuItems[3].textContent).toContain("ai_segmentation");

    act(() => {
      menuItems[1].firstElementChild.click();
    });

    expect(view.container.textContent).toContain("API A");
    expect(view.container.textContent).toContain("API B");
    expect(view.container.textContent).not.toContain("Disabled API");

    const apiBOption = [
      ...view.container.querySelectorAll('[role="option"]'),
    ].find((element) => element.textContent === "API B");
    act(() => {
      apiBOption.click();
    });

    expect(view.updateSetting).toHaveBeenCalledWith({
      name: "apiSlug",
      value: "api-b",
    });
    view.cleanup();
  });

  test("disables translation service selection when no API is enabled", () => {
    const view = renderMenus({
      transApis: [
        {
          apiSlug: "api-disabled",
          apiName: "Disabled API",
          apiType: "builtin",
          isDisabled: true,
        },
      ],
    });
    const serviceMenuItem = view.container.firstElementChild.children[1];

    act(() => {
      serviceMenuItem.firstElementChild.click();
    });

    expect(view.container.textContent).not.toContain("Disabled API");
    expect(view.updateSetting).not.toHaveBeenCalled();
    view.cleanup();
  });

  test("the three Select menus stay locked when they have no choices", () => {
    const updateSetting = jest.fn();
    const view = renderMenus({ transApis: [], updateSetting });
    const findTrigger = (label) =>
      [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')].find((b) =>
        b.textContent.includes(label)
      );
    const triggers = [
      findTrigger("translate_service"),
      findTrigger("ai_segmentation"),
      findTrigger("ai_enhanced_context"),
    ];
    expect(triggers.every(Boolean)).toBe(true);
    for (const trigger of triggers) {
      expect(trigger.getAttribute("aria-disabled")).toBe("true");
      act(() => trigger.click());
    }
    expect(view.container.querySelectorAll('[role="option"]').length).toBe(0);
    expect(updateSetting).not.toHaveBeenCalled();
    view.cleanup();
  });
});

describe("subtitle acquisition menu", () => {
  test("separates acquisition, processing and download states", () => {
    const view = renderMenus({
      acquisition: {
        phase: "ready",
        track: { languageCode: "en", kind: "asr" },
      },
      progressed: 45,
      canDownload: true,
    });
    expect(view.container.textContent).not.toContain(
      "youtube_caption_generated"
    );
    expect(view.container.textContent).not.toContain("45%");
    expect(view.container.textContent).toContain(
      "youtube_caption_download_partial"
    );
    expect(view.container.textContent).not.toContain("[45%]");
    view.cleanup();
  });

  test("recovery buttons and cooldown status are absent; Escape and disabled downloads remain accessible", () => {
    const onClose = jest.fn();
    const view = renderMenus({
      acquisition: {
        phase: "error",
        code: "RATE_LIMITED",
        cooldownUntil: Date.now() + 2000,
      },
      translationError: true,
      onClose,
    });
    expect(view.container.querySelector('[role="status"]')).toBeNull();
    expect(view.container.textContent).not.toMatch(/retry|rate_limited|2s/);
    const download = [
      ...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]'),
    ].find((b) => b.textContent === "download_subtitles");
    expect(download.getAttribute("aria-disabled")).toBe("true");
    act(() =>
      download.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    view.cleanup();
  });
});

describe("subtitle dropdown ARIA roles and roving tabindex", () => {
  const terminologyDirectory = [
    { id: "tbl_1", name: "计算机网络" },
    { id: "tbl_2", name: "医学术语" },
    { id: "tbl_3", name: "AI大模型" },
  ];
  const transApis = [
    { apiSlug: "api-a", apiName: "API A", apiType: "builtin" },
    { apiSlug: "api-b", apiName: "API B", apiType: "builtin" },
  ];

  function findTrigger(view, label) {
    return [
      ...view.container.querySelectorAll(
        '[role="button"], [role="menuitemcheckbox"], [role="switch"]'
      ),
    ].find((item) => item.textContent.includes(label));
  }

  function openSelectPanel(view) {
    const trigger = findTrigger(view, "translate_service");
    act(() => trigger.firstElementChild.click());
    return trigger;
  }

  function openMultiSelectPanel(view) {
    const trigger = findTrigger(view, "terminology_tables");
    act(() => trigger.firstElementChild.click());
    return trigger;
  }

  test("Select panel carries listbox role with zero-focus container and roving tabindex on selected option", () => {
    const view = renderMenus({ transApis });
    const trigger = openSelectPanel(view);

    const listbox = view.container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox.getAttribute("tabindex")).toBeNull();
    // 容器零焦点：面板本身不得持有 tabindex="0"。
    expect(listbox.getAttribute("tabindex") === "0").toBe(false);

    const options = [...listbox.querySelectorAll('[role="option"]')];
    expect(options.length).toBe(2);
    const roving = options.filter(
      (option) => option.getAttribute("tabindex") === "0"
    );
    // 恰一项 tabIndex=0（选中项 api-a），其余 -1。
    expect(roving.length).toBe(1);
    expect(roving[0].getAttribute("aria-selected")).toBe("true");
    expect(
      options
        .filter((option) => option.getAttribute("tabindex") === "-1")
        .length
    ).toBe(1);
    expect(trigger).not.toBeNull();
    view.cleanup();
  });

  test("dialog switch rows expose ARIA switch semantics and stay individually focusable", () => {
    // 触发域：role="dialog" 面板内的开关行（本文件根节点）。语义依据：该行渲染
    // 52x32 轨道＋Thumb 的真开关形态，且宿主不是 role="menu"，故用 switch；
    // 可达性机制沿用盘面现状——每行 tabIndex=0 独立 Tab 可达，不做方向键漫游。
    const view = renderMenus({
      autoTranslate: true,
      asr: { active: false, available: true },
      asrActions: {},
    });
    const panel = view.container.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    const rows = [...panel.querySelectorAll('[role="switch"]')];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.getAttribute("aria-checked") === "true" || row.getAttribute("aria-checked") === "false").toBe(true);
      expect(row.getAttribute("tabindex")).toBe("0");
    }
    expect(
      panel.querySelector('[role="switch"][aria-checked="true"]')
    ).not.toBeNull();
    view.cleanup();
  });

  test("dialog rows are not menuitemcheckbox once they are switches", () => {
    // 同改动的可证伪面：关面板状态下，对话框内不得再有 menuitemcheckbox 行
    // （Switch 行是唯一持有该角色的对话框元素；DropdownOption 行只在展开的
    // role="menu" 面板内，另有用例覆盖）。
    const view = renderMenus({
      transApis: [{ apiSlug: "ai", apiName: "AI", apiType: "OpenAI" }],
      formData: {
        segSlug: "ai",
        apiSlug: "ai",
        autoTranslate: true,
        aiContextSlug: "ai",
      },
      asr: {
        available: true,
        active: true,
        phase: "complete",
        timingSource: "audio-chunk",
      },
      asrActions: {},
    });
    expect(
      view.container.querySelectorAll('[role="dialog"] [role="menuitemcheckbox"]')
        .length
    ).toBe(0);
    view.cleanup();
  });

  test("MultiSelect panel carries menu role with menuitemcheckbox children roving on first item", () => {
    const view = renderMenus({
      transApis,
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1"],
        autoTranslate: true,
      },
    });
    openMultiSelectPanel(view);

    const menu = view.container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu.getAttribute("tabindex")).toBeNull();

    const items = [...menu.querySelectorAll('[role="menuitemcheckbox"]')];
    expect(items.length).toBe(3);
    // 无固有焦点选中态的 Menu 取第一项为激活位。
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(items[1].getAttribute("tabindex")).toBe("-1");
    expect(items[2].getAttribute("tabindex")).toBe("-1");
    view.cleanup();
  });

  test("Escape on the trigger closes an item-less MultiSelect panel and keeps trigger focus", () => {
    // 空态面板无可聚焦项：焦点停在触发源，Escape 必须只关面板、
    // 焦点留在触发源，且不得穿透根 dialog 关闭整个菜单。
    const onClose = jest.fn();
    const view = renderMenus({
      transApis,
      terminologyDirectory: [],
      onClose,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_removed"],
        autoTranslate: true,
      },
    });
    const trigger = openMultiSelectPanel(view);
    trigger.focus();

    expect(view.container.querySelector('[role="menu"]')).not.toBeNull();
    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(view.container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // 面板级 Escape 不冒泡出根 dialog：整个菜单不得被连带关闭。
    expect(onClose).not.toHaveBeenCalled();
    view.cleanup();
  });

  test("Select trigger swallows panel-level Escape without closing the root menu", () => {
    // 对称补齐 MultiSelect handleTriggerKeyDown：Select 面板开启、
    // 焦点仍在触发源的瞬态窗口按 Escape，只关面板、不冒泡至根 dialog。
    const onClose = jest.fn();
    const view = renderMenus({ transApis, onClose });
    const trigger = openSelectPanel(view);
    trigger.focus();

    expect(view.container.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // 面板级 Escape 不冒泡出根 dialog：整个菜单不得被连带关闭。
    expect(onClose).not.toHaveBeenCalled();
    view.cleanup();
  });

  test("empty MultiSelect keeps the menu role around the empty placeholder", () => {
    // 仓库事实：目录空且 termsList 空时 MultiSelect 整行禁用（面板不可达）；
    // 可达的空态路径＝termsList 非空但目录为空（options 渲染 DropdownEmpty）。
    const view = renderMenus({
      transApis,
      terminologyDirectory: [],
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_removed"],
        autoTranslate: true,
      },
    });
    openMultiSelectPanel(view);

    const menu = view.container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain("none");
    view.cleanup();
  });

  test("arrow keys move focus within the Select listbox with wrap-around", () => {
    const view = renderMenus({ transApis });
    openSelectPanel(view);

    const listbox = view.container.querySelector('[role="listbox"]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    act(() => options[0].focus());
    expect(document.activeElement).toBe(options[0]);

    const fireKey = (element, key) =>
      act(() => {
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        );
      });

    fireKey(options[0], "ArrowDown");
    expect(document.activeElement).toBe(options[1]);
    // Roving Tabindex 同步：停靠项 -1、新激活项 0，随焦点走。
    expect(options[0].getAttribute("tabindex")).toBe("-1");
    expect(options[1].getAttribute("tabindex")).toBe("0");
    fireKey(options[1], "ArrowDown");
    // 末项 ArrowDown 回绕至首项。
    expect(document.activeElement).toBe(options[0]);
    expect(options[1].getAttribute("tabindex")).toBe("-1");
    expect(options[0].getAttribute("tabindex")).toBe("0");
    // 首项 ArrowUp 回绕至末项（负模修正）。
    fireKey(options[0], "ArrowUp");
    expect(document.activeElement).toBe(options[1]);
    fireKey(options[1], "Home");
    expect(document.activeElement).toBe(options[0]);
    fireKey(options[0], "End");
    expect(document.activeElement).toBe(options[1]);

    // 方向键不向宿主泄漏（preventDefault + stopPropagation 成对）。
    // React 17+ 事件委托挂在 createRoot 容器上（同节点监听器不受
    // stopPropagation 影响），故 spy 必须挂更外层的 document.body。
    let leaked = 0;
    const spy = (event) => {
      if (
        ["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(event.key)
      )
        leaked += 1;
    };
    document.body.addEventListener("keydown", spy);
    fireKey(document.activeElement, "ArrowDown");
    fireKey(document.activeElement, "ArrowUp");
    fireKey(document.activeElement, "Home");
    fireKey(document.activeElement, "End");
    document.body.removeEventListener("keydown", spy);
    expect(leaked).toBe(0);
    view.cleanup();
  });

  test("Escape closes the Select panel and returns focus to the trigger MenuItem", () => {
    const view = renderMenus({ transApis });
    const trigger = openSelectPanel(view);

    const listbox = view.container.querySelector('[role="listbox"]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    act(() => options[0].focus());

    // Escape 的 stopPropagation 收容须有用例锚定，防回归。
    let leaked = 0;
    const spy = (event) => {
      if (event.key === "Escape") leaked += 1;
    };
    document.body.addEventListener("keydown", spy);

    act(() => {
      options[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    document.body.removeEventListener("keydown", spy);
    expect(leaked).toBe(0);
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    // 焦点显式回退触发源（MenuItem 根 div），不落 body。
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  test("roving invariant holds when the stored value is absent from options", () => {
    // value 不在 options 中（脏数据兜底）：显示层回退首项，roving 判据
    // 必须与显示层同源——仍恰一项 tabIndex=0，不得退化为 0 项。
    const view = renderMenus({
      transApis,
      formData: {
        apiSlug: "ghost-api",
        segSlug: "-",
        skipAd: false,
        isBilingual: true,
        blurTranslation: false,
        autoTranslate: true,
        aiContextSlug: "-",
      },
    });
    openSelectPanel(view);

    const options = [
      ...view.container.querySelectorAll('[role="option"]'),
    ];
    const roving = options.filter(
      (option) => option.getAttribute("tabindex") === "0"
    );
    expect(roving.length).toBe(1);
    expect(roving[0].getAttribute("aria-selected")).toBe("true");
    expect(roving[0].textContent).toBe("API A");
    view.cleanup();
  });

  test("keyboard Enter on an option selects it and returns focus to the trigger", () => {
    const updateSetting = jest.fn();
    const view = renderMenus({ transApis, updateSetting });
    const trigger = openSelectPanel(view);

    const listbox = view.container.querySelector('[role="listbox"]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    act(() => options[1].focus());

    act(() => {
      options[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    expect(updateSetting).toHaveBeenCalledWith({
      name: "apiSlug",
      value: "api-b",
    });
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    // 键盘路径选择后焦点同样回退触发源，不落 body。
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  test("opening the Select panel focuses the active option without preventScroll so the panel scrolls it into view", () => {
    // 可滚动面板（maxHeight:200, overflow:auto）内的选项聚焦不得传
    // preventScroll:true，否则焦点项停在可视区外、面板不滚动（对齐
    // PopupCont.js roving 导航同款 preventScroll:false 先例）。
    // 用原型 spy 而非单元素 spy：面板 toggle 条件卸载重挂（{isOpen &&
    // <DropdownPanel/>}），重开渲染全新 DOM 节点，挂在旧节点上的
    // spy 会变陈旧引用、永不触发；原型 spy 在开面板动作之前就位即可
    // 稳定捕获开面板聚焦路径，无需关再开两次 toggle。
    const focusSpy = jest.spyOn(HTMLElement.prototype, "focus");
    const view = renderMenus({ transApis });
    try {
      openSelectPanel(view);

      const listbox = view.container.querySelector('[role="listbox"]');
      const optionRows = new Set(
        [...listbox.querySelectorAll('[role="option"]')]
      );
      // 按 this 上下文过滤出 target 属于面板选项行的 focus 调用：
      // jest>=27.3 提供 focusSpy.mock.contexts，旧版 jest 无该属性时
      // 用等价的 focusSpy.mock.instances 作回退（无测试触发该回退分支，注释只陈述机制不声明覆盖）。
      const contexts = focusSpy.mock.contexts ?? focusSpy.mock.instances;
      const optionFocusArgs = contexts
        .map((el, i) => (optionRows.has(el) ? focusSpy.mock.calls[i] : null))
        .filter((args) => args !== null);
      expect(optionFocusArgs.length).toBeGreaterThan(0);
      for (const args of optionFocusArgs) {
        expect(args).toEqual([]);
      }
    } finally {
      // 失败路径也必须归还全局焦点原型并卸载视图：resetMocks 只清
      // mock 状态、不还原被 spyOn 替换的属性，残留会摘掉真实 focus
      // 实现并污染本文件后续所有用例。
      focusSpy.mockRestore();
      view.cleanup();
    }
  });

  test("arrow-key roving navigation focuses the next option without preventScroll", () => {
    const view = renderMenus({ transApis });
    openSelectPanel(view);

    const listbox = view.container.querySelector('[role="listbox"]');
    const options = [...listbox.querySelectorAll('[role="option"]')];
    act(() => options[0].focus());

    const focusSpy = jest.spyOn(options[1], "focus");
    try {
      act(() => {
        options[0].dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });
      // 修前 scriptFocus 传 {preventScroll:true}，修后无参：恰一次调用
      // ＋逐调用无参断言。不用空参 toHaveBeenCalledWith()——污染态下
      // 混入的零参调用会令其伪通过。
      expect(focusSpy).toHaveBeenCalledTimes(1);
      for (const args of focusSpy.mock.calls) {
        expect(args).toEqual([]);
      }
    } finally {
      // 失败路径同样归还元素级 spy 与视图，防残留跨用例污染。
      focusSpy.mockRestore();
      view.cleanup();
    }
  });

  test("Select trigger declares listbox popup semantics driven by isOpen", () => {
    const view = renderMenus({ transApis });
    const trigger = findTrigger(view, "translate_service");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openSelectPanel(view);
    const reopenTrigger = findTrigger(view, "translate_service");
    expect(reopenTrigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(reopenTrigger.getAttribute("aria-expanded")).toBe("true");
    view.cleanup();
  });

  test("MultiSelect trigger declares menu popup semantics driven by isOpen", () => {
    const view = renderMenus({
      terminologyDirectory: [
        { id: "tbl_1", name: "A" },
        { id: "tbl_2", name: "B" },
      ],
      formData: { apiSlug: "api-a", termsList: [], autoTranslate: true },
    });
    const trigger = findTrigger(view, "terminology_tables");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openMultiSelectPanel(view);
    const reopenTrigger = findTrigger(view, "terminology_tables");
    expect(reopenTrigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(reopenTrigger.getAttribute("aria-expanded")).toBe("true");
    view.cleanup();
  });

  test("non-trigger MenuItems carry no popup semantics", () => {
    const view = renderMenus({ transApis });
    const rows = [
      ...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]'),
    ];
    // 菜单内恰有 4 个弹层触发项：translate_service/ai_segmentation/
    // ai_enhanced_context 三个 Select + terminology_tables MultiSelect
    // （术语目录为空仍渲染，禁用态同为弹层触发项）。
    const triggerLabels = [
      "translate_service",
      "terminology_tables",
      "ai_segmentation",
      "ai_enhanced_context",
    ];
    const popupRows = rows.filter(
      (item) => item.getAttribute("aria-haspopup") !== null
    );
    expect(popupRows.length).toBe(4);
    for (const item of popupRows) {
      expect(
        triggerLabels.some((label) => item.textContent.includes(label))
      ).toBe(true);
    }
    const nonTriggers = rows.filter(
      (item) =>
        !triggerLabels.some((label) => item.textContent.includes(label))
    );
    expect(nonTriggers.length).toBeGreaterThan(0);
    for (const item of nonTriggers) {
      expect(item.getAttribute("aria-haspopup")).toBeNull();
      expect(item.getAttribute("aria-expanded")).toBeNull();
    }
    view.cleanup();
  });
});

describe("subtitle terminology MultiSelect", () => {
  const terminologyDirectory = [
    { id: "tbl_1", name: "计算机网络" },
    { id: "tbl_2", name: "医学术语" },
    { id: "tbl_3", name: "AI大模型" },
  ];

  test("renders terminology option directly below translate service with empty state", () => {
    const view = renderMenus({
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: [],
        autoTranslate: true,
      },
    });

    const buttons = [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')];
    const serviceIndex = buttons.findIndex((item) =>
      item.textContent.includes("translate_service")
    );
    const terminologyIndex = buttons.findIndex((item) =>
      item.textContent.includes("terminology_tables")
    );

    expect(serviceIndex).toBeGreaterThanOrEqual(0);
    expect(terminologyIndex).toBe(serviceIndex + 1);

    const termButton = buttons[terminologyIndex];
    expect(termButton.textContent).toContain("none");
    view.cleanup();
  });

  test("displays single or multiple terminology labels in summary", () => {
    const viewSingle = renderMenus({
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1"],
        autoTranslate: true,
      },
    });
    expect(viewSingle.container.textContent).toContain("计算机网络");
    viewSingle.cleanup();

    const viewMultiple = renderMenus({
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1", "tbl_2"],
        autoTranslate: true,
      },
    });
    expect(viewMultiple.container.textContent).toContain(
      "计算机网络, 医学术语"
    );
    viewMultiple.cleanup();

    const viewMany = renderMenus({
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1", "tbl_2", "tbl_3"],
        autoTranslate: true,
      },
    });
    expect(viewMany.container.textContent).toContain("selected 3");
    viewMany.cleanup();
  });

  test("toggles terminology choices in MultiSelect panel without closing", () => {
    const updateSetting = jest.fn();
    const view = renderMenus({
      terminologyDirectory,
      updateSetting,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1"],
        autoTranslate: true,
      },
    });

    const buttons = [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')];
    const termButton = buttons.find((item) =>
      item.textContent.includes("terminology_tables")
    );

    // 展开下拉浮层
    act(() => termButton.click());

    const options = [
      ...termButton.parentElement.querySelectorAll('[role="menuitemcheckbox"]'),
    ];
    expect(options.length).toBe(3);

    // 选中指示由行首 MenuCheckGlyph 图标实体交换承载（mui/lucide 双档勾/空对，
    // 随 iconStyle 切换）；语义由 menuitemcheckbox 的 aria-checked 承担，
    // aria 布尔属性不作视觉驱动载体。
    expect(options[0].textContent).not.toContain("✓");
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    expect(options[1].getAttribute("aria-checked")).toBe("false");
    options.forEach((row) => {
      expect(row.getAttribute("aria-selected")).toBeNull();
    });
    // 多选行整行零持久染色：inline 底色全面退役（React 对
    // undefined 不落盘 → style.background 为空串），状态由 checkbox 本体承载。
    expect(options[0].querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(options[1].querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(options[0].style.background).toBe("");
    expect(options[1].style.background).toBe("");

    // 点击第二个选项（tbl_2）追加选择
    act(() => options[1].click());
    expect(updateSetting).toHaveBeenCalledWith({
      name: "termsList",
      value: ["tbl_1", "tbl_2"],
    });

    // 浮层仍处于展开状态
    expect(
      termButton.parentElement.querySelectorAll('[role="menuitemcheckbox"]').length
    ).toBe(3);

    // 点击第一个选项（tbl_1）取消选择
    act(() => options[0].click());
    expect(updateSetting).toHaveBeenCalledWith({
      name: "termsList",
      value: [],
    });

    view.cleanup();
  });

  test("multi-select rows carry menuitemcheckbox semantics driven by aria-checked, not aria-selected", () => {
    const view = renderMenus({
      terminologyDirectory,
      formData: {
        apiSlug: "api-a",
        termsList: ["tbl_1"],
        autoTranslate: true,
      },
    });

    const buttons = [...view.container.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')];
    const termButton = buttons.find((item) =>
      item.textContent.includes("terminology_tables")
    );
    act(() => termButton.click());

    // 作用域收窄：顶层开关行携带 role="switch"（见 Menus.js「Switch 组件」节），
    // 不是 menuitemcheckbox，本就不命中 menuitemcheckbox 查询；容器级查询会
    // 污染计数，浮层行唯一存在于触发行父容器内。
    const options = [
      ...termButton.parentElement.querySelectorAll('[role="menuitemcheckbox"]'),
    ];
    expect(options.length).toBe(3);
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    expect(options[1].getAttribute("aria-checked")).toBe("false");
    options.forEach((row) => {
      expect(row.getAttribute("aria-selected")).toBeNull();
    });

    view.cleanup();
  });

  test("single-select dropdown uses background color for selection (v5 T1 → M3 v3.1)", () => {
    const view = renderMenus({
      transApis: [
        { apiSlug: "api-a", apiName: "API A", apiType: "builtin" },
        { apiSlug: "api-b", apiName: "API B", apiType: "builtin" },
      ],
    });
    const menuItems = view.container.firstElementChild.children;
    act(() => {
      menuItems[1].firstElementChild.click();
    });
    const optionRows = [
      ...view.container.querySelectorAll('[role="option"]'),
    ];
    expect(optionRows.length).toBe(2);
    expect(view.container.textContent).not.toContain("✓");
    // 单选行（豁免域）选中仍 accent rgba；未选中行 inline 底色退役为空串。
    expect(optionRows[0].style.background).toBe("rgba(32, 156, 238, 0.8)");
    expect(optionRows[1].style.background).toBe("");
    view.cleanup();
  });

  test("self-drawn rows use accent literal background for selection (M3 v3.1 §3.1.C exemption)", () => {
    const view = renderMenus({
      transApis: [
        { apiSlug: "api-a", apiName: "API A", apiType: "builtin" },
        { apiSlug: "api-b", apiName: "API B", apiType: "builtin" },
      ],
    });
    const menuItems = view.container.firstElementChild.children;
    act(() => {
      menuItems[1].firstElementChild.click();
    });
    const triggerRow = view.container.querySelector('[role="button"], [role="menuitemcheckbox"], [role="switch"]');
    const optionRows = [...view.container.querySelectorAll('[role="option"]')];
    expect(optionRows.length).toBe(2);
    const selectedOption = optionRows[0];
    const unselectedOption = optionRows[1];
    expect(selectedOption.getAttribute("aria-selected")).toBe("true");
    // 触发行（MenuItem）与未选中行 inline 底色退役为空串；单选选中行仍 accent rgba。
    expect(triggerRow.style.background).toBe("");
    expect(selectedOption.style.background).toBe("rgba(32, 156, 238, 0.8)");
    expect(unselectedOption.style.background).toBe("");
    view.cleanup();
  });

  test("subtitle menu geometry and focus ring follow the current system", () => {
    const view = renderMenus({
      autoTranslate: false,
      transApis: [{ apiSlug: "api-a", apiName: "API A", apiType: "builtin" }],
    });
    const menuRoot = view.container.firstElementChild;
    // 根容器圆角对齐现行 4dp；菜单行几何对齐现行 0 16px。
    expect(getComputedStyle(menuRoot).borderRadius).toBe("4px");
    const triggerRow = menuRoot.querySelector('[role="button"], [role="menuitemcheckbox"], [role="switch"]');
    expect(getComputedStyle(triggerRow).padding).toBe("0px 16px");
    // 自绘 Switch 对齐现行形态：轨 52x32，thumb 未选 16 / 选中 24，位移 20px。
    const switchTrack = triggerRow.lastElementChild;
    expect(getComputedStyle(switchTrack).width).toBe("52px");
    expect(getComputedStyle(switchTrack).height).toBe("32px");
    const thumb = switchTrack.firstElementChild;
    expect(getComputedStyle(thumb).width).toBe("16px");
    // 选中档视觉（value=true）经 isBilingual 行实证：Switch 为受控组件、视觉由
    // formData prop 驱动，行点击经 no-op updateSetting 不回写 props，故选中档
    // 取 renderMenus 缺省 formData.isBilingual=true 的既有数据行承载断言。
    const bilingualRow = [...menuRoot.querySelectorAll('[role="button"], [role="menuitemcheckbox"], [role="switch"]')].find(
      (item) => item.textContent === "is_bilingual_view"
    );
    const checkedThumb = bilingualRow.lastElementChild.firstElementChild;
    expect(getComputedStyle(checkedThumb).width).toBe("24px");
    expect(checkedThumb.style.transform).toBe("translateX(20px)");
    // focus-visible 经类选择器规则补齐现行 focusRing 形态（内嵌 3px，不被容器裁切）。
    expect(menuRoot.className).toBe("kt-subtitle-menus");
    const styleTag = menuRoot.querySelector("style");
    expect(styleTag.textContent).toContain(
      '.kt-subtitle-menus [role="option"]:focus-visible'
    );
    // 环改内嵌：字幕菜单挂在 YouTube 播放器滚动容器内，外扩 2px 会被切左右。
    expect(styleTag.textContent).toContain(
      "box-shadow: inset 0 0 0 3px #209cee"
    );
    expect(styleTag.textContent).not.toContain("outline-offset: 2px");
    expect(styleTag.textContent).toContain(
      '[data-kt-focus-silent="true"][role="option"]:focus-visible'
    );
    view.cleanup();
  });
});
