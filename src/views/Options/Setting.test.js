import { act } from "react";
import { createRoot } from "react-dom/client";
import { AutoTranslateClipboardSetting, ExtCommands } from "./Setting";
import { browser } from "../../libs/browser";
import { useAlert } from "../../hooks/Alert";
import {
  hasClipboardReadPermission,
  requestClipboardReadPermission,
} from "../../libs/clipboard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/browser", () => ({
  browser: {
    commands: { getAll: jest.fn() },
    tabs: { create: jest.fn() },
    permissions: {
      onAdded: { addListener: jest.fn(), removeListener: jest.fn() },
      onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  },
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: jest.fn(),
}));

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
  isExt: true,
}));
jest.mock("../../libs/clipboard", () => ({
  CLIPBOARD_READ_PERMISSION: "clipboardRead",
  hasClipboardReadPermission: jest.fn(),
  requestClipboardReadPermission: jest.fn(),
}));
jest.mock("../../hooks/Shortcut", () => ({ useShortcut: jest.fn() }));
jest.mock("./ShortcutInput", () => () => null);
jest.mock("../../hooks/Fab", () => ({ useFab: jest.fn() }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/log", () => ({
  kissLog: jest.fn(),
  LogLevel: { INFO: { value: 3 } },
}));
jest.mock("./UploadButton", () => () => null);
jest.mock("./DownloadButton", () => () => null);
jest.mock("../../hooks/ValidationInput", () => () => null);

const commands = [
  {
    name: "toggleTranslate",
    description: "Toggle Translate",
    shortcut: "Alt+Q",
  },
];
const alert = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
};
const originalUserAgent = navigator.userAgent;

function setUserAgent(userAgent) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

async function renderCommands() {
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(<ExtCommands />);
  });

  return { container, root };
}

describe("ExtCommands", () => {
  beforeEach(() => {
    browser.commands.getAll.mockResolvedValue(commands);
    browser.tabs.create.mockReset();
    alert.info.mockReset();
    useAlert.mockReturnValue(alert);
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  test("shows Firefox shortcut-management instructions without opening a tab", async () => {
    setUserAgent("Mozilla/5.0 Firefox/141.0");
    const { container, root } = await renderCommands();

    await act(async () => {
      container.querySelector("button").click();
    });

    expect(alert.info).toHaveBeenCalledWith("firefox_shortcut_edit_hint");
    expect(browser.tabs.create).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("opens Chromium's extension shortcut page", async () => {
    setUserAgent("Mozilla/5.0 Chrome/139.0.0.0 Safari/537.36");
    const { container, root } = await renderCommands();

    await act(async () => {
      container.querySelector("button").click();
    });

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts",
    });
    expect(alert.info).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

async function chooseBooleanOption(container, value) {
  const input = container.querySelector('input[name="autoTranslateClipboard"]');
  const button = input
    .closest(".MuiInputBase-root")
    .querySelector('[role="combobox"]');

  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    document.body
      .querySelector(`[role="option"][data-value="${value}"]`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AutoTranslateClipboardSetting", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    hasClipboardReadPermission.mockResolvedValue(false);
    requestClipboardReadPermission.mockReset();
    alert.success.mockReset();
    alert.warning.mockReset();
    useAlert.mockReturnValue(alert);
  });

  test("enables the setting only after permission is granted", async () => {
    requestClipboardReadPermission.mockResolvedValue(true);
    const onChange = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AutoTranslateClipboardSetting value={false} onChange={onChange} />
      );
      await Promise.resolve();
    });

    await chooseBooleanOption(container, true);

    expect(requestClipboardReadPermission).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(alert.success).toHaveBeenCalledWith("clipboard_permission_granted");
    act(() => root.unmount());
  });

  test("keeps the setting disabled when permission is denied", async () => {
    requestClipboardReadPermission.mockResolvedValue(false);
    const onChange = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AutoTranslateClipboardSetting value={false} onChange={onChange} />
      );
      await Promise.resolve();
    });

    await chooseBooleanOption(container, true);

    expect(onChange).toHaveBeenCalledWith(false);
    expect(alert.warning).toHaveBeenCalledWith("clipboard_permission_denied");
    act(() => root.unmount());
  });
});
