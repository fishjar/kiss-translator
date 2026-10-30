/* eslint-disable testing-library/no-unnecessary-act -- These tests use React createRoot directly. */
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileTranslationProvider, useFileTranslation } from "./State";
import { getFileClient } from "../../fileTranslation/client";
import { useTheme } from "@mui/material";
import {
  DEFAULT_ICON_COLOR,
  DEFAULT_ICON_STYLE,
  getIconColorSnapshot,
  getIconStyleSnapshot,
  setIconColorSnapshot,
} from "../../styles/m3";

jest.mock("../../fileTranslation/client", () => ({ getFileClient: jest.fn() }));

// iconColor 数据源契约（PR #17 评审闭环）：homepage 视图树无 browser.storage
// 访问权，State.js 经 useHomepageIconColor 同步读 window.localStorage；测试
// 直接操作 localStorage 走真实 hook，不再桩化 hooks/Storage（该依赖链已删）。

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
let value, container, root;
function Content() {
  value = useFileTranslation();
  const theme = useTheme();
  return (
    <>
      <h1>File Translation</h1>
      {value.connectionStatus}
      {value.connectionNotice}
      <div data-testid="content">File content</div>
      <div data-testid="theme">{theme.palette.mode}</div>
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
  localStorage.removeItem("kiss-homepage-icon-color");
  setIconColorSnapshot(DEFAULT_ICON_COLOR);
});

test("palette primary and secondary derive from the icon color snapshot hue instead of hardcoded defaults", async () => {
  let primary = "";
  let secondary = "";
  let secondaryContainer = "";
  function PaletteProbe() {
    primary = useTheme().palette.primary.main;
    secondary = useTheme().palette.secondary.main;
    secondaryContainer = useTheme().palette.secondary.secondaryContainer;
    return null;
  }
  // Provider mount effect unconditionally consumes getFileClient()（State.js
  // mount 段 client.subscribe）；与本文件既有用例同规，先落桩再渲染。
  const client = makeClient();
  client.connect.mockReturnValue(new Promise(() => {}));
  getFileClient.mockReturnValue(client);
  localStorage.setItem("kiss-homepage-icon-color", "#ba9090");
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <PaletteProbe />
      </FileTranslationProvider>
    )
  );
  // hue 0 浅色家族主色（calculateAdaptivePrimaryFamily(0, "light").primary 契约推导）。
  expect(primary).toBe("#723b3b");
  // 次强调随同一色相派生：palette.secondary.main 接可读的 secondary
  // （calculateAdaptiveAccentFamilies(0, "light").secondary 契约推导），
  // 禁落 MUI createTheme 默认 secondary 紫 #9c27b0。
  expect(secondary).toBe("#664747");
  // 容器色以扩展键暴露，供背景用途（ImageViewerDialog 选中态药丸）取用。
  expect(secondaryContainer).toBe("#eae1e1");
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

test("writes the homepage localStorage icon color into the snapshot and never touches the style snapshot", async () => {
  // 本页生产唯一写入点契约：FileTranslationProvider 读 homepage 本地
  // iconColor 后只写 iconColor（页面视图树不含分发器图标，iconStyle
  // 不归本页管）。数据源为 window.localStorage（homepage 无扩展存储）。
  const client = makeClient();
  client.connect.mockReturnValue(new Promise(() => {}));
  getFileClient.mockReturnValue(client);
  localStorage.setItem("kiss-homepage-icon-color", "#a590ba");
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe("#a590ba");
  // 风格快照零触碰：保持默认档，页面图标（直连 MUI 静态导入）不受影响。
  expect(getIconStyleSnapshot()).toBe(DEFAULT_ICON_STYLE);
});

test("falls back to the default icon color when unset and re-reads localStorage on remount", async () => {
  const client = makeClient();
  client.connect.mockReturnValue(new Promise(() => {}));
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  // localStorage 无值 → hook 回落默认档；同步读取无加载期门控。
  expect(getIconColorSnapshot()).toBe(DEFAULT_ICON_COLOR);
  // 存储值变更 → 重挂载重读 localStorage 并写入共享快照。
  localStorage.setItem("kiss-homepage-icon-color", "#ba9090");
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe("#ba9090");
});

test("restores the homepage fallback after a colored extension disconnects or a legacy context follows", async () => {
  // 先收到扩展颜色写入快照；随后断开（或重连到无 iconColor 投影的旧版
  // 扩展）时，共享快照恢复 homepage 本地回退值，不沿用前一个扩展的颜色。
  localStorage.setItem("kiss-homepage-icon-color", "#ba9090");
  const client = makeClient();
  client.session = { sessionId: "colored-ext", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    iconColor: "#a590ba",
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe("#a590ba");
  // 断开：快照立即恢复 homepage 回退值。
  await act(async () =>
    client.emit({ type: "disconnected", error: new Error("link lost") })
  );
  expect(getIconColorSnapshot()).toBe("#ba9090");
  // 重连到旧版扩展：context 无 iconColor 字段，快照保持 homepage 回退值。
  client.session = { sessionId: "legacy-ext", extensionVersion: "1.0.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
  });
  await act(async () =>
    client.emit({
      type: "connected",
      reconnecting: true,
      session: client.session,
    })
  );
  expect(getIconColorSnapshot()).toBe("#ba9090");
});

test("applies the icon color delivered by the extension context to the shared snapshot", async () => {
  // PR #17 评审闭环 · 预接线（E1 最小同步路径）：扩展侧权威 iconColor
  // 经既有 getContext 通道随 uiLang 同形送达，refresh() 收到即写共享快照。
  // 页面只消费、不回写 kiss-homepage-icon-color（homepage 本地偏好独立）。
  const client = makeClient();
  client.session = { sessionId: "icon-color", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    iconColor: "#a590ba",
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe("#a590ba");
  expect(localStorage.getItem("kiss-homepage-icon-color")).toBeNull();
});

test("normalizes a dirty icon color delivered over the context channel", async () => {
  // 通道脏值防御：非法字符串经 setIconColorSnapshot 归一回落默认档，
  // 不污染主题、不写入 localStorage。
  const client = makeClient();
  client.session = { sessionId: "icon-dirty", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    iconColor: "md3",
  });
  getFileClient.mockReturnValue(client);
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe(DEFAULT_ICON_COLOR);
  expect(localStorage.getItem("kiss-homepage-icon-color")).toBeNull();
});

test("keeps the homepage localStorage value when an older context carries no icon color", async () => {
  // 旧版兼容护栏：无 iconColor 投影的 context（旧扩展/用户脚本）不得把
  // 本地回退值打回默认档——仅字符串字段才写快照。
  const client = makeClient();
  client.session = { sessionId: "legacy-context", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
  });
  getFileClient.mockReturnValue(client);
  localStorage.setItem("kiss-homepage-icon-color", "#ba9090");
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(getIconColorSnapshot()).toBe("#ba9090");
});
