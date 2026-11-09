/* eslint-disable testing-library/no-unnecessary-act -- These tests use React createRoot directly. */
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileTranslationProvider, useFileTranslation } from "./State";
import { getFileClient } from "../../fileTranslation/client";
import { useTheme } from "@mui/material";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

jest.mock("../../fileTranslation/client", () => ({ getFileClient: jest.fn() }));

function makeClient() {
  let subscriber;
  return {
    connect: jest.fn(),
    request: jest.fn(),
    subscribe: jest.fn((listener) => {
      subscriber = listener;
      return jest.fn();
    }),
    dispose: jest.fn(function () {
      this.disposed = true;
    }),
    emit: (event) => subscriber(event),
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let value, container, root, capturedTheme;
function Content() {
  value = useFileTranslation();
  capturedTheme = useTheme();
  return (
    <>
      <h1>File Translation</h1>
      {value.connectionStatus}
      {value.connectionNotice}
      <div data-testid="content">File content</div>
      <div data-testid="theme">{capturedTheme.palette.mode}</div>
    </>
  );
}
beforeEach(() => {
  localStorage.removeItem("kiss-file-translate-lang");
  localStorage.removeItem("kiss-homepage-lang");
  localStorage.setItem("kiss-homepage-theme", "light");
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("StrictMode ignores an old connection failure and keeps notices below the title", async () => {
  const old = makeClient(),
    current = makeClient();
  const attempt = deferred();
  old.connect.mockReturnValue(attempt.promise);
  current.session = { sessionId: "new", extensionVersion: "2.1.0" };
  current.connect.mockResolvedValue(current.session);
  current.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    models: [],
    ocrModels: [],
  });
  getFileClient.mockReturnValueOnce(old).mockReturnValue(current);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <StrictMode>
        <FileTranslationProvider>
          <Content />
        </FileTranslationProvider>
      </StrictMode>
    )
  );
  await act(async () => attempt.reject(new Error("stale failure")));
  expect(old.dispose).toHaveBeenCalledTimes(1);
  expect(value.connected).toBe(true);
  expect(container.textContent).not.toContain("stale failure");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Connected · 2.1.0");
  await act(async () =>
    current.emit({ type: "disconnected", error: new Error("connection lost") })
  );
  expect(value.connected).toBe(false);
  expect(container.textContent).toContain("connection lost");
  const title = container.querySelector("h1"),
    notice = container.querySelector('[role="alert"]');
  expect(
    title.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});

test("queued scene writes retain order and never replay into a new session", async () => {
  const client = makeClient(),
    firstWrite = deferred();
  client.session = { sessionId: "first", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockImplementation(async (method) =>
    method === "getContext"
      ? {
          scenes: { txt: { toLang: "en" } },
          services: [],
          prompts: [],
          styles: [],
          models: [],
          ocrModels: [],
        }
      : firstWrite.promise
  );
  getFileClient.mockReturnValue(client);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () => {
    value.patchScene("txt", { toLang: "zh-CN" });
    value.patchScene("txt", { toLang: "ja" });
  });
  expect(
    client.request.mock.calls.filter(([method]) => method === "patchScene")
  ).toHaveLength(1);
  client.session = { sessionId: "second" };
  await act(async () => firstWrite.resolve({}));
  expect(
    client.request.mock.calls.filter(([method]) => method === "patchScene")
  ).toHaveLength(1);
});

test("connected language follows extension changes and survives disconnect", async () => {
  const client = makeClient();
  const context = {
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    models: [],
    ocrModels: [],
    uiLang: "zh",
  };
  client.session = { sessionId: "language", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue(context);
  getFileClient.mockReturnValue(client);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(value.uiLang).toBe("zh");
  expect(value.i18n("translate")).toBe("翻译");
  expect(document.documentElement.lang).toBe("zh-CN");
  client.request.mockResolvedValue({ ...context, uiLang: "ja" });
  jest.useFakeTimers();
  try {
    await act(async () => {
      client.emit({ type: "contextChanged" });
      jest.advanceTimersByTime(150);
    });
    expect(value.uiLang).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    await act(async () =>
      client.emit({ type: "disconnected", error: new Error("disconnected") })
    );
    expect(value.uiLang).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(localStorage.getItem("kiss-file-translate-lang")).toBe("ja");
  } finally {
    jest.useRealTimers();
  }
});

test("automatic reconnect clears the notice and refreshes extension context", async () => {
  const client = makeClient();
  client.session = { sessionId: "first", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    models: [],
    ocrModels: [],
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () =>
    client.emit({ type: "disconnected", error: new Error("lost") })
  );
  expect(value.connected).toBe(false);
  await act(async () => client.emit({ type: "reconnecting" }));
  expect(container.textContent).toContain("Reconnecting");
  client.session = { sessionId: "restored", extensionVersion: "2.1.0" };
  const before = client.request.mock.calls.length;
  await act(async () =>
    client.emit({
      type: "connected",
      reconnecting: true,
      session: client.session,
    })
  );
  expect(value.connected).toBe(true);
  expect(container.textContent).not.toContain("lost");
  expect(client.request.mock.calls.length).toBe(before + 1);
});

test("cached language and toggled theme survive disconnect and a new page mount", async () => {
  const client = makeClient();
  client.session = { sessionId: "preferences", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    uiLang: "zh",
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () => value.toggleTheme());
  expect(localStorage.getItem("kiss-homepage-theme")).toBe("dark");
  await act(async () =>
    client.emit({ type: "disconnected", error: new Error("lost") })
  );
  expect(value.uiLang).toBe("zh");
  expect(container.querySelector('[data-testid="theme"]').textContent).toBe(
    "dark"
  );
  act(() => root.unmount());
  root = createRoot(container);
  const next = makeClient();
  next.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(next);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(value.uiLang).toBe("zh");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(container.querySelector('[data-testid="theme"]').textContent).toBe(
    "dark"
  );
  expect(localStorage.getItem("kiss-homepage-lang")).toBeNull();
});

test("retry countdown uses the scheduled deadline and manual connect exits the wait", async () => {
  jest.useFakeTimers();
  const client = makeClient();
  client.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(client);
  try {
    await act(async () =>
      root.render(
        <FileTranslationProvider>
          <Content />
        </FileTranslationProvider>
      )
    );
    const reconnectAt = Date.now() + 8000;
    await act(async () =>
      client.emit({ type: "reconnectScheduled", reconnectAt })
    );
    expect(container.textContent).toContain("Reconnecting in 8s");
    await act(async () => jest.advanceTimersByTime(2000));
    expect(container.textContent).toContain("Reconnecting in 6s");
    jest.setSystemTime(reconnectAt - 1000);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange"))
    );
    expect(container.textContent).toContain("Reconnecting in 1s");
    const pending = deferred();
    client.connect.mockReturnValue(pending.promise);
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Reconnect now"
    );
    await act(async () => button.click());
    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Connecting");
    expect(container.textContent).not.toContain("Reconnecting in");
    await act(async () => pending.reject(new Error("timeout")));
    expect(
      container.querySelector('button[aria-label="Connect extension"]').disabled
    ).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test("unavailable storage does not lose the in-memory extension language", async () => {
  const client = makeClient();
  client.session = { sessionId: "storage", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    uiLang: "ja",
  });
  getFileClient.mockReturnValue(client);
  const store = jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("unavailable");
    });
  try {
    await act(async () =>
      root.render(
        <FileTranslationProvider>
          <Content />
        </FileTranslationProvider>
      )
    );
    await act(async () =>
      client.emit({ type: "disconnected", error: new Error("lost") })
    );
    expect(value.uiLang).toBe("ja");
  } finally {
    store.mockRestore();
  }
});

test("automatic discovery exposes multiple extensions for manual selection", async () => {
  const client = makeClient();
  client.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () => client.emit({ type: "reconnecting" }));
  await act(async () =>
    client.emit({
      type: "reconnectFailed",
      error: Object.assign(new Error("choose extension"), {
        extensions: ["one", "two"],
      }),
    })
  );
  expect(container.querySelector('[role="combobox"]')).not.toBeNull();
  expect(container.textContent).toContain("choose extension");
  expect(
    container.querySelector('button[aria-label="Connect extension"]').disabled
  ).toBe(false);
});

test.each(["resolve", "reject"])(
  "a previous session context %s cannot replace restored settings",
  async (settlement) => {
    const client = makeClient(),
      oldContext = deferred();
    const context = {
      scenes: {},
      services: [],
      prompts: [],
      styles: [],
      models: [],
      ocrModels: [],
    };
    client.session = { sessionId: "first", extensionVersion: "2.1.0" };
    client.connect.mockResolvedValue(client.session);
    client.request
      .mockReturnValueOnce(oldContext.promise)
      .mockResolvedValue({ ...context, uiLang: "ja" });
    getFileClient.mockReturnValue(client);
    await act(async () =>
      root.render(
        <FileTranslationProvider>
          <Content />
        </FileTranslationProvider>
      )
    );
    await act(async () =>
      client.emit({ type: "disconnected", error: new Error("lost") })
    );
    client.session = { sessionId: "restored", extensionVersion: "2.1.0" };
    await act(async () =>
      client.emit({
        type: "connected",
        reconnecting: true,
        session: client.session,
      })
    );
    await act(async () =>
      oldContext[settlement](
        settlement === "resolve"
          ? { ...context, uiLang: "zh" }
          : new Error("stale failure")
      )
    );
    expect(value.uiLang).toBe("ja");
    expect(value.connected).toBe(true);
    expect(container.textContent).not.toContain("stale failure");
    expect(container.querySelector('[data-testid="content"]').textContent).toBe(
      "File content"
    );
  }
);

test("successful reader settings save clears its error and preserves model warnings", async () => {
  const client = makeClient();
  client.session = { sessionId: "save", extensionVersion: "2.1.1" };
  client.connect.mockResolvedValue(client.session);
  const context = {
    scenes: { epub: { readerPreferences: { pageWidth: 840, fontSize: 20 } } },
    services: [],
    prompts: [],
    styles: [],
  };
  let rejectSave = true;
  client.request.mockImplementation(async (method, params) => {
    if (method === "getContext") return context;
    if (rejectSave) throw new Error("阅读设置无效");
    context.scenes[params.kind] = {
      ...context.scenes[params.kind],
      ...params.patch,
    };
    return context.scenes[params.kind];
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () =>
    value.patchScene("epub", {
      readerPreferences: { pageWidth: 880, fontSize: 20 },
    })
  );
  let button = container.querySelector('button[aria-label="刷新配置"]');
  // The language defaults to English unless the extension supplies uiLang.
  button =
    button || container.querySelector('button[aria-label="Refresh settings"]');
  expect(button.title).toBe("阅读设置无效");
  expect(button.className).toContain("Warning");
  rejectSave = false;
  await act(async () =>
    value.patchScene("epub", {
      readerPreferences: { pageWidth: 1020, fontSize: 20 },
    })
  );
  expect(button.title).not.toBe("阅读设置无效");
  expect(button.className).toContain("Success");
  expect(value.context.scenes.epub.readerPreferences.pageWidth).toBe(1020);
  context.modelError = "model unavailable";
  jest.useFakeTimers();
  try {
    await act(async () => {
      client.emit({ type: "contextChanged" });
      jest.advanceTimersByTime(150);
    });
    await act(async () =>
      value.patchScene("epub", {
        readerPreferences: { pageWidth: 680, fontSize: 20 },
      })
    );
    expect(button.title).toBe("model unavailable");
    expect(button.className).toContain("Warning");
    expect(value.context.scenes.epub.readerPreferences).toEqual({
      pageWidth: 680,
      fontSize: 20,
    });
    client.request.mockRejectedValueOnce(new Error("context unavailable"));
    await act(async () => {
      client.emit({ type: "contextChanged" });
      jest.advanceTimersByTime(150);
    });
    await act(async () =>
      value.patchScene("epub", {
        readerPreferences: { pageWidth: 840, fontSize: 20 },
      })
    );
    expect(button.title).toBe("context unavailable");
    expect(button.className).toContain("Warning");
  } finally {
    jest.useRealTimers();
  }
});

test("overrides MuiMenuItem so menu rows share one height and padding token", async () => {
  const client = makeClient();
  client.session = { sessionId: "theme", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(capturedTheme.components.MuiMenuItem).toBeDefined();
  const menuItemRoot =
    capturedTheme.components.MuiMenuItem.styleOverrides.root({
      theme: capturedTheme,
    });
  // 选中态走 secondary-container 族底色。
  expect(menuItemRoot["&.Mui-selected"]).toEqual({
    backgroundColor: capturedTheme.palette.secondary.main,
    color: capturedTheme.palette.secondary.contrastText,
  });
  // 勾槽 ::before 整体退役。
  expect(menuItemRoot["&::before"]).toBeUndefined();
  expect(menuItemRoot["&.Mui-selected::before"]).toBeUndefined();
  // hover/selected:hover 恢复半透明叠色；
  // 选中行 hover 保留 secondary 实底（contrastText 12% 叠 secondary.main）。
  expect(menuItemRoot["&.Mui-selected:hover"]).toEqual({
    backgroundColor: `color-mix(in srgb, ${capturedTheme.palette.secondary.contrastText} 12%, ${capturedTheme.palette.secondary.main})`,
  });
  expect(menuItemRoot["&:hover"]).toEqual({
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  });
  // 焦点环挂 :focus-visible 键盘语境伪类（同 M3Theme
  // MenuItem 双缺陷修复：.Mui-focusVisible 类与输入方式无关，鼠标链路误显环）；
  // 环改 inset 内嵌（MenuList 零水平 padding 场景外描环被裁），底色保留 State Layer 12%。
  expect(menuItemRoot["&&:focus-visible"]).toEqual({
    outline: "none",
    boxShadow: "inset 0 0 0 3px #0B57D0",
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
  });
  // 暗色档：焦点环换用 m3.js 暗色 primary 定型值，对暗底对比达标。
  const darkMenuItemRoot = capturedTheme.components.MuiMenuItem.styleOverrides.root(
    {
      theme: {
        palette: {
          mode: "dark",
          secondary: { main: "#E8DEF8", contrastText: "#1D192B" },
        },
        // root 函数体内调用 theme.spacing(0.5)（State.js:382-383 paddingTop/
        // paddingBottom），存根缺 spacing 会先 TypeError；八分度缺省即可。
        spacing: (n) => n * 8,
      },
    }
  );
  expect(darkMenuItemRoot["&&:focus-visible"].boxShadow).toBe(
    "inset 0 0 0 3px #A8C7FA"
  );
  // 选中行键盘焦点保留 secondary 实底（特异性 (0,4,0) 恒压通用的 (0,3,0)）。
  expect(menuItemRoot["&&.Mui-selected:focus-visible"]).toEqual({
    backgroundColor: `color-mix(in srgb, ${capturedTheme.palette.secondary.contrastText} 12%, ${capturedTheme.palette.secondary.main})`,
  });
  // .Mui-focusVisible 挂点不得残留任何样式（鼠标打开路径不命中环）。
  expect(menuItemRoot["&&.Mui-focusVisible"]).toBeUndefined();
  // 数据多选菜单（aria-multiselectable，经 TerminologySelect 的 <Select multiple>
  // 进入本域主题）：持久选中染色禁令与瞬时反馈保留同时成立——选中行去底色、
  // hover 8% 叠加、focus-visible 12% 叠加。
  expect(menuItemRoot['[aria-multiselectable="true"] &&.Mui-selected']).toEqual({
    backgroundColor: "transparent",
    color: "inherit",
  });
  expect(
    menuItemRoot['[aria-multiselectable="true"] &&.Mui-selected:hover']
  ).toEqual({
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  });
  expect(
    menuItemRoot['[aria-multiselectable="true"] &&.Mui-selected:focus-visible']
  ).toEqual({
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
  });
  // forced-colors 兜底（对齐 M3Theme forcedColorsFocusRing 配对模式）。
  expect(menuItemRoot["@media (forced-colors: active)"]["&&:focus-visible"]).toEqual({
    outline: "3px solid",
    outlineOffset: -3,
  });
});

test("gives the settings select entry its own baseline in the State theme", async () => {
  const client = makeClient();
  client.session = { sessionId: "theme-select", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  // 运行时注入实证：<CssBaseline /> 把 MuiCssBaseline.styleOverrides 经 emotion
  // Global 落进 document.head；emotion 经 CSSOM insertRule 注入，style 标签
  // textContent 恒空，故必须读 document.styleSheets 的规则面而非标签文本。
  // 注入断言同时是行为级防退化锁：若有人退回 "@global" 包裹（emotion 序列化
  // 器无该键特殊处理，产出被 CSSOM 丢弃的未知 at-rule），顶层选择器规则不在
  // 场即红。
  const injectedRules = Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules);
    } catch {
      return [];
    }
  });
  const injectedRule = injectedRules.find(
    (rule) => rule.selectorText === ".kt-settings-select .MuiSelect-select"
  );
  expect(injectedRule).toBeDefined();
  expect(injectedRule.style.getPropertyValue("font-size")).toBe("14px");
  expect(injectedRule.style.getPropertyValue("text-overflow")).toBe("ellipsis");
  const selectRule =
    capturedTheme.components.MuiCssBaseline.styleOverrides[
      ".kt-settings-select .MuiSelect-select"
    ];
  // 与 Options 域去 600 后的规则对齐（字重回落主题默认 400）：
  // State 域无 --kt-on / --kt-settings-font-size 变量集，规则不得引用，
  // font-size 用 14px 字面量对齐该域既有设置字号口径；color 走继承。
  expect(selectRule).toEqual({
    fontSize: "14px",
    textOverflow: "ellipsis",
  });
});

test("pins the FileTranslate MuiSwitch overrides to the current switch system", async () => {
  const client = makeClient();
  client.session = { sessionId: "theme-switch", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  const switchOverrides = capturedTheme.components.MuiSwitch.styleOverrides;
  // switchBase 为函数形态（({ theme }) => ({ ... })）：先调用取对象再断言；
  // 几何键与 mode 无关，用浅色 capturedTheme 调用一次供全部几何断言复用。
  const switchBase = switchOverrides.switchBase({ theme: capturedTheme });
  // 契约一：轨 52x32，thumb 未选 16 / 选中 24，位移 translateX(20px)。
  expect(switchOverrides.root).toMatchObject({
    width: 52,
    height: 32,
    padding: 0,
  });
  expect(switchBase["&.Mui-checked"].transform).toBe("translateX(20px)");
  expect(switchBase["&.Mui-checked"]["& .MuiSwitch-thumb"]).toEqual({
    width: 24,
    height: 24,
  });
  expect(switchOverrides.thumb).toMatchObject({ width: 16, height: 16 });
  // 契约二：switchBase 整组布局键同值复刻现行（未选 thumb 网格居中，无垂直错位）。
  expect(switchBase).toMatchObject({
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    top: 0,
    left: 0,
    padding: 0,
    transform: "none",
  });
  expect(switchBase["&.Mui-checked"]["& .MuiSwitch-input"]).toEqual({
    left: -20,
  });
  // 契约三：焦点环沿用现行 focusRing 形态（3px solid + offset 2），色值按
  // mode 二态：浅色 #0B57D0、暗色 #A8C7FA（暗档对暗底对比达标）。
  expect(switchBase["&.Mui-focusVisible"]).toEqual({
    outline: "3px solid #0B57D0",
    outlineOffset: 2,
  });
  const darkSwitchBase = switchOverrides.switchBase({
    theme: { palette: { mode: "dark" } },
  });
  expect(darkSwitchBase["&.Mui-focusVisible"]).toEqual({
    outline: "3px solid #A8C7FA",
    outlineOffset: 2,
  });
  // 契约四：track 保留现行 2px border（宽度与线形钉死，色值属颜色豁免域不钉）。
  expect(switchOverrides.track).toMatchObject({ borderRadius: 999, opacity: 1 });
  expect(switchOverrides.track.border).toMatch(/^2px solid /);
});

test("FileTranslationProvider marks document.body as kt-focus-silent-scope", async () => {
  // 防恒真：渲染前 body 不得已带该类。
  expect(document.body.classList.contains("kt-focus-silent-scope")).toBe(false);
  const client = makeClient();
  client.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  // 作用域类必须落在 document.body（MUI Portal 内容的祖先链只到 body，
  // #root 内 wrapper 无法命中 Portal 菜单项）。
  expect(document.body.classList.contains("kt-focus-silent-scope")).toBe(true);
  // children 可查询性契约不破（既有 DOM 查询不依赖 wrapper）。
  expect(container.querySelector('[data-testid="content"]').textContent).toBe(
    "File content"
  );
  // 卸载必须移除该类（幂等清理，不污染后续挂载域）。
  act(() => root.unmount());
  expect(document.body.classList.contains("kt-focus-silent-scope")).toBe(false);
});
