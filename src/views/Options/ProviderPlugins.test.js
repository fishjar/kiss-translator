jest.mock("../../hooks/I18n", () => ({
  useI18n: () =>
    require("../../config/i18n").newI18n(mockSetting.uiLang || "zh"),
}));
import { approvePlugin, readPluginGrant } from "../../providers/grants";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import ProviderPlugins from "./ProviderPlugins";
import {
  readProviderDirectory,
  readProviderFile,
} from "../../providers/package";
import {
  listProviderPackages,
  saveProviderPackage,
  removeProviderPackage,
} from "../../providers/packageStore";
import { packageFingerprint } from "../../providers/packageFingerprint";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockSetting = { providerPlugins: [], transApis: [] };
const mockUpdateSetting = jest.fn();
let mockPackages = [];
const mockConfirm = jest.fn(async () => true);
jest.mock("../../hooks/Confirm", () => ({ useConfirm: () => mockConfirm }));
jest.mock("./PluginAuthorization", () => () => null);
jest.mock("../../providers/authorizationDefinitions", () => ({
  packageDefinitions: (pack) =>
    pack.manifest.services.map((service) => ({ provider: service })),
  summarizeAuthorization: () => ({
    origins: ["https://fixed.invalid"],
    endpointFields: ["API 基础地址"],
    services: [],
    versions: [],
  }),
}));
jest.mock("../../providers/grants", () => ({
  approvePlugin: jest.fn(),
  readPluginGrant: jest.fn(async () => null),
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateSetting: mockUpdateSetting,
  }),
}));
jest.mock("../../providers/packageStore", () => ({
  listProviderPackages: jest.fn(async () => mockPackages),
  saveProviderPackage: jest.fn(),
  removeProviderPackage: jest.fn(),
  subscribeProviderPackageChanges: () => () => {},
}));
jest.mock("../../providers/package", () => ({
  readProviderDirectory: jest.fn(),
  readProviderFile: jest.fn(),
}));
jest.mock("../../providers/packageFingerprint", () => ({
  packageFingerprint: jest.fn(async () => "fingerprint"),
}));
jest.mock("../../components/ApiProviderIcon", () => () => null);

const pack = (version = "1.0.0", id = "example-plugin") => ({
  id,
  manifest: {
    id,
    name: "Example plugin",
    version,
    apiVersion: "1",
    services: [
      { id: "chat", name: "Chat", capabilities: { chat: { handler: "chat" } } },
    ],
  },
  implementations: { chat: "exports.chat = () => ({text:'ok'})" },
  source: { kind: "directory" },
  integrity: "fingerprint",
});
let container;
let root;
beforeEach(() => {
  jest.clearAllMocks();
  approvePlugin.mockResolvedValue(undefined);
  readPluginGrant.mockResolvedValue(null);
  saveProviderPackage.mockResolvedValue(undefined);
  mockPackages = [];
  listProviderPackages.mockImplementation(async () => mockPackages);
  packageFingerprint.mockResolvedValue("fingerprint");
  mockSetting.uiLang = "zh";
  mockSetting.providerPlugins = [];
  mockConfirm.mockResolvedValue(true);
  readProviderDirectory.mockResolvedValue(pack());
  readProviderFile.mockResolvedValue({ ...pack(), source: { kind: "file" } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => root.render(<ProviderPlugins />));
}
function input(label) {
  return [...container.querySelectorAll("label")]
    .find((item) => item.textContent === label)
    .querySelector("input");
}
async function choose(label) {
  const picker = input(label);
  const files = [{ webkitRelativePath: "example/manifest.json" }];
  await act(async () =>
    Simulate.change(picker, { target: { files, value: "chosen" } })
  );
  return files;
}

test("folder picker resets so the same directory can be selected again", async () => {
  await render();
  expect(input("导入文件夹").hasAttribute("webkitdirectory")).toBe(true);
  const target = {
    files: [{ webkitRelativePath: "example/manifest.json" }],
    value: "chosen",
  };
  await act(async () => Simulate.change(input("导入文件夹"), { target }));
  expect(target.value).toBe("");
  expect(saveProviderPackage).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmText: "安装并授权" })
  );
  expect(approvePlugin).toHaveBeenCalledTimes(1);
  await choose("导入文件夹");
  expect(readProviderDirectory).toHaveBeenCalledTimes(2);
  expect(mockUpdateSetting).toHaveBeenCalledTimes(2);
});

test("local plugins offer both update formats and display folder source and missing-template instructions", async () => {
  mockPackages = [pack()];
  mockSetting.providerPlugins = [
    { pluginId: "missing", version: "1.0.0", source: { kind: "directory" } },
  ];
  await render();
  expect(input("选择更新 ZIP").accept).toBe(".zip");
  expect(input("选择更新文件夹").hasAttribute("webkitdirectory")).toBe(true);
  expect(container.textContent).toContain("本地文件夹");
  expect(container.textContent).toContain("请重新导入原 ZIP 包或插件文件夹");
  readProviderDirectory.mockResolvedValue(pack("1.0.1"));
  await choose("选择更新文件夹");
  expect(saveProviderPackage).toHaveBeenCalledWith(
    expect.objectContaining({ source: { kind: "directory" } })
  );
  readProviderFile.mockResolvedValue({
    ...pack("1.0.1"),
    source: { kind: "file" },
  });
  await choose("选择更新 ZIP");
  expect(readProviderFile).toHaveBeenCalledTimes(1);
});

test.each([
  ["1.0.1", "different-plugin", "插件 ID 不一致"],
  ["1.0.0", "example-plugin", "无需更新"],
  ["0.9.0", "example-plugin", "提高 Manifest 版本"],
])(
  "folder update enforces plugin identity and version: %s %s",
  async (version, id, message) => {
    mockPackages = [pack()];
    readProviderDirectory.mockResolvedValue(pack(version, id));
    await render();
    await choose("选择更新文件夹");
    expect(container.textContent).toContain(message);
    expect(saveProviderPackage).not.toHaveBeenCalled();
  }
);

test("changed content at the same version is rejected", async () => {
  mockPackages = [{ ...pack(), integrity: "old-fingerprint" }];
  await render();
  await choose("选择更新文件夹");
  expect(container.textContent).toContain("不能覆盖同版本内容");
  expect(saveProviderPackage).not.toHaveBeenCalled();
});

test("declining installation and cancelling the picker do not persist", async () => {
  mockConfirm.mockResolvedValue(false);
  await render();
  await act(async () =>
    Simulate.change(input("导入文件夹"), { target: { files: [], value: "" } })
  );
  expect(readProviderDirectory).not.toHaveBeenCalled();
  await choose("导入文件夹");
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(saveProviderPackage).not.toHaveBeenCalled();
  expect(mockUpdateSetting).not.toHaveBeenCalled();
});

test("model previews show identical names and IDs once and retain distinct localized names", async () => {
  const plugin = pack();
  plugin.manifest.services[0].models = [
    { id: "deepseek-flash", name: "deepseek-flash" },
    { id: "named-model", name: "Named model" },
    { id: "localized-model", name: "Original", nameI18n: { zh: "本地名称" } },
    {
      id: "same-localized",
      name: "Original",
      nameI18n: { zh: "same-localized" },
    },
    { id: "unnamed-model" },
  ];
  mockPackages = [plugin];
  await render();
  const table = container.querySelector('table[aria-label="插件服务接口"]');
  const cell = table.querySelector("tbody tr").querySelectorAll("td")[3];
  expect(
    [...cell.querySelectorAll("p")].map((item) => item.textContent)
  ).toEqual([
    "deepseek-flash",
    "Named model",
    "named-model",
    "本地名称",
    "localized-model",
    "same-localized",
    "unnamed-model",
  ]);
});

test("interface previews expand independently and copy declared templates without changing settings", async () => {
  const plugin = pack();
  plugin.manifest.services = [
    {
      id: "translate",
      name: "Translate",
      capabilities: {
        translate: { handler: "translate" },
        dictionary: { handler: "dictionary" },
        segmentSubtitle: { handler: "subtitle" },
        parseImage: { handler: "vision" },
      },
      defaultPrompts: {
        batch: { systemPrompt: "Batch", userPrompt: "{{items}}" },
        nobatch: { systemPrompt: "Single {{text}}" },
        dictionary: { userPrompt: "Dictionary" },
        subtitle: { systemPrompt: "Subtitle" },
        vlm: { userPrompt: "Vision" },
      },
    },
    {
      id: "dictionary",
      name: "Dictionary",
      capabilities: { dictionary: { handler: "dictionary" } },
    },
    { id: "tts", name: "TTS", capabilities: { speak: { handler: "speak" } } },
  ];
  mockPackages = [plugin];
  const original = JSON.stringify(plugin);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  try {
    await render();
    const table = container.querySelector('table[aria-label="插件服务接口"]');
    const buttons = [...table.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(table.querySelector("textarea")).toBeNull();
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    await act(async () => buttons[0].click());
    const preview = document.getElementById(
      buttons[0].getAttribute("aria-controls")
    );
    expect(preview.querySelector("td").colSpan).toBe(4);
    expect(preview.textContent).toContain("当前插件包的默认模板");
    expect(
      [...preview.querySelectorAll("h6")].map((item) => item.textContent)
    ).toEqual([
      "单句翻译提示词",
      "聚合翻译提示词",
      "词典提示词",
      "字幕提示词",
      "图片识别提示词",
    ]);
    const fields = [...preview.querySelectorAll("textarea")].filter(
      (item) => !item.getAttribute("aria-hidden")
    );
    expect(fields.map((item) => item.value)).toEqual([
      "Single {{text}}",
      "Batch",
      "{{items}}",
      "Dictionary",
      "Subtitle",
      "Vision",
    ]);
    expect(fields.every((item) => item.readOnly)).toBe(true);
    const copies = preview.querySelectorAll("button");
    await act(async () => copies[1].click());
    expect(writeText).toHaveBeenLastCalledWith("Batch\n\n{{items}}");
    await act(async () => copies[2].click());
    expect(writeText).toHaveBeenLastCalledWith("Dictionary");
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => copies[0].click());
    expect(preview.textContent).toContain("复制失败，请从只读内容框中手动复制");
    await act(async () => buttons[1].click());
    expect(table.textContent).toContain("插件未公开默认提示词");
    expect(table.textContent).toContain("Single");
    await act(async () => buttons[0].click());
    expect(table.querySelector("textarea")).toBeNull();
    expect(table.textContent).toContain("插件未公开默认提示词");
    expect(JSON.stringify(plugin)).toBe(original);
    expect(saveProviderPackage).not.toHaveBeenCalled();
    expect(mockUpdateSetting).not.toHaveBeenCalled();
  } finally {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else delete navigator.clipboard;
  }
});

test("missing local templates do not expose previews even for prompt capabilities", async () => {
  mockSetting.providerPlugins = [
    {
      pluginId: "missing",
      name: "Missing",
      version: "1.0.0",
      services: [
        {
          id: "translate",
          name: "Translate",
          capabilities: { translate: { handler: "translate" } },
        },
      ],
    },
  ];
  await render();
  expect(container.textContent).toContain("请重新导入原 ZIP 包或插件文件夹");
  expect(container.textContent).not.toContain("预览提示词");
});

test("failed authorization preserves an installed template and reports an actionable error", async () => {
  saveProviderPackage.mockImplementationOnce(async (value) => {
    mockPackages = [value];
  });
  approvePlugin.mockRejectedValueOnce(new Error("授权写入失败"));
  await render();
  await choose("导入文件夹");
  expect(saveProviderPackage).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("已安装");
  expect(container.textContent).toContain("授权写入失败");
});

test("uninstall is confirmed through MUI hook and does not revoke snapshot authorization", async () => {
  mockPackages = [pack()];
  await render();
  const uninstall = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "卸载插件"
  );
  mockConfirm.mockResolvedValueOnce(false);
  await act(async () => uninstall.click());
  expect(removeProviderPackage).not.toHaveBeenCalled();
  mockConfirm.mockResolvedValueOnce(true);
  await act(async () => uninstall.click());
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "卸载插件",
      message: expect.stringContaining("快照授权仍保留"),
    })
  );
  expect(removeProviderPackage).toHaveBeenCalledWith("example-plugin");
});

test("updating without new origins reuses authorization without rewriting it", async () => {
  mockPackages = [pack()];
  readPluginGrant.mockResolvedValue({
    enabled: true,
    origins: ["https://fixed.invalid"],
  });
  readProviderDirectory.mockResolvedValue(pack("1.0.1"));
  await render();
  await choose("选择更新文件夹");
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmText: "更新插件" })
  );
  expect(approvePlugin).not.toHaveBeenCalled();
  expect(saveProviderPackage).toHaveBeenCalledTimes(1);
});
test("updating authorizes only the new package targets", async () => {
  mockPackages = [pack()];
  readPluginGrant.mockResolvedValue({
    enabled: true,
    origins: ["https://old.invalid"],
  });
  readProviderDirectory.mockResolvedValue(pack("1.0.1"));
  await render();
  await choose("选择更新文件夹");
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmText: "更新并授权" })
  );
  expect(approvePlugin).toHaveBeenCalledWith("example-plugin", [
    "https://fixed.invalid",
  ]);
});

test("plugin metadata and controls follow UI language changes without rewriting saved names", async () => {
  const installed = pack();
  installed.manifest.name = "OpenAI 兼容协议示例";
  installed.manifest.services[0].name = "文本生成与翻译";
  mockPackages = [installed];
  mockSetting.uiLang = "en";
  await render();
  expect(container.textContent).toContain("Import ZIP");
  expect(container.textContent).toContain("OpenAI-compatible example");
  expect(container.textContent).toContain("Text generation and translation");
  expect(container.textContent).not.toMatch(/[一-龥]/);
  mockSetting.uiLang = "zh_TW";
  await render();
  expect(container.textContent).toContain("匯入 ZIP");
  expect(container.textContent).toContain("文字生成");
  expect(installed.manifest.services[0].name).toBe("文本生成与翻译");
  expect(mockUpdateSetting).not.toHaveBeenCalled();
});
