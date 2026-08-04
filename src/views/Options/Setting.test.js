import { act } from "react";
import { createRoot } from "react-dom/client";
import { ExtCommands } from "./Setting";
import { browser } from "../../libs/browser";
import { useAlert } from "../../hooks/Alert";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/browser", () => ({
  browser: {
    commands: { getAll: jest.fn() },
    tabs: { create: jest.fn() },
  },
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Alert", () => ({
  useAlert: jest.fn(),
}));

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../libs/client", () => ({ isExt: true }));
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
const alert = { info: jest.fn() };
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
