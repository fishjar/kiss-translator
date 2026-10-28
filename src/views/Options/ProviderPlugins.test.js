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
import {
  loadPluginDirectory,
  downloadOfficialPlugin,
} from "../../providers/pluginDirectory";
jest.mock("../../hooks/I18n", () => ({
  useI18n: () =>
    require("../../config/i18n").newI18n(mockSetting.uiLang || "zh"),
}));
jest.mock("../../providers/pluginDirectory", () => ({
  ...jest.requireActual("../../providers/pluginDirectory"),
  loadPluginDirectory: jest.fn(),
  downloadOfficialPlugin: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockSetting = { providerPlugins: [], transApis: [] };
const mockUpdateSetting = jest.fn();
let mockPackages = [];
const mockConfirm = jest.fn(async () => true);
jest.mock("../../hooks/Confirm", () => ({ useConfirm: () => mockConfirm }));
jest.mock("../../providers/packageNetwork", () => ({
  packageDefinitions: jest.requireActual("../../providers/packageNetwork")
    .packageDefinitions,
  summarizePackageNetwork: () => ({
    origins: ["https://fixed.invalid"],
    endpointFields: ["API 基础地址"],
    services: [],
  }),
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
    apiVersion: 1,
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
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official" ? { plugins: [] } : { items: [], total_count: 0 }
  );
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
  // eslint-disable-next-line testing-library/no-unnecessary-act -- React createRoot does not wrap render in act.
  await act(async () => root.render(<ProviderPlugins />));
}

test.each([
  ["empty", [], [], true],
  ["official package", ["deepseek"], [], true],
  ["official index", [], ["deepseek"], true],
  ["community package", ["community-plugin"], [], false],
  ["community index", [], ["community-plugin"], false],
  ["mixed", ["deepseek", "community-plugin"], [], false],
])(
  "community empty state follows the current category: %s",
  async (_name, localIds, indexIds, empty) => {
    mockPackages = localIds.map((id) => pack("1.0.0", id));
    mockSetting.providerPlugins = indexIds.map((pluginId) => ({
      pluginId,
      version: "1.0.0",
      source: { kind: "file" },
    }));
    loadPluginDirectory.mockImplementation(async (kind) =>
      kind === "official"
        ? {
            plugins: [
              {
                id: "deepseek",
                name: "DeepSeek",
                version: "1.0.0",
                apiVersion: 1,
                capabilities: ["chat"],
              },
            ],
          }
        : { items: [], total_count: 0 }
    );
    await render();
    const community = container.querySelectorAll("section")[1];
    const message = require("../../config/i18n").newI18n("zh")(
      "plugin_no_external_plugins_installed_import_a_zip_or_local_folder_or_enter_a_"
    );
    expect(community.textContent.includes(message)).toBe(empty);
    expect(community.querySelector(".MuiAccordion-root") !== null).toBe(!empty);
  }
);

test("old local examples merge into the official list and explicit updates retain service snapshots", async () => {
  const old = pack("1.2.1", "deepseek");
  mockPackages = [old];
  const entry = {
    id: old.id,
    name: "DeepSeek",
    version: "1.2.2",
    apiVersion: 1,
    capabilities: ["chat"],
  };
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official" ? { plugins: [entry] } : { items: [], total_count: 0 }
  );
  const updated = {
    ...pack("1.2.2", old.id),
    source: {
      kind: "zip",
      url: "https://raw.githubusercontent.com/fishjar/kiss-translator-plugins/dist/deepseek/1.2.2.zip",
      archiveSha256: "a".repeat(64),
    },
  };
  downloadOfficialPlugin.mockResolvedValue(updated);
  const previousSetting = {
    ...mockSetting,
    transApis: [
      {
        apiSlug: "existing",
        provider: { source: { pluginId: old.id }, code: "saved snapshot" },
        pluginConfig: { apiKey: "retained" },
      },
    ],
  };
  const before = JSON.stringify(previousSetting);
  await render();
  const sections = container.querySelectorAll("section");
  expect(sections[0].textContent).toContain("Example plugin");
  expect(sections[1].textContent).not.toContain("Example plugin");
  await act(async () =>
    [...sections[0].querySelectorAll("button")]
      .find((button) => button.textContent.includes("1.2.2"))
      .click()
  );
  expect(downloadOfficialPlugin).toHaveBeenCalledWith(
    entry,
    expect.any(AbortSignal)
  );
  expect(saveProviderPackage).toHaveBeenCalledWith(updated);
  const next = mockUpdateSetting.mock.calls[0][0](previousSetting);
  expect(next.transApis).toEqual(previousSetting.transApis);
  expect(next.providerPlugins[0].source).toEqual(updated.source);
  expect(JSON.stringify(previousSetting)).toBe(before);
});

test("a missing local template imported from a file can restore the matching official version with the synced fingerprint", async () => {
  const plugin = pack("1.2.2", "deepseek");
  mockSetting.providerPlugins = [
    {
      pluginId: plugin.id,
      version: "1.2.2",
      integrity: "fingerprint",
      source: { kind: "file" },
    },
  ];
  const entry = {
    id: plugin.id,
    name: "DeepSeek",
    version: "1.2.2",
    apiVersion: 1,
    capabilities: ["chat"],
  };
  loadPluginDirectory.mockImplementation(async (kind) =>
    kind === "official" ? { plugins: [entry] } : { items: [], total_count: 0 }
  );
  downloadOfficialPlugin.mockResolvedValue(plugin);
  await render();
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "恢复模板"
  );
  expect(button).toBeDefined();
  await act(async () => button.click());
  expect(saveProviderPackage).toHaveBeenCalledWith(plugin);
});
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
    expect.objectContaining({ confirmText: "安装插件" })
  );
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

test("model previews show each complete model ID once without repeating display names", async () => {
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
    "named-model",
    "localized-model",
    "same-localized",
    "unnamed-model",
  ]);
});

test("transcription capability cells show supported, unsupported and unknown timestamp states", async () => {
  const plugin = pack();
  plugin.manifest.services = [
    {
      id: "asr",
      name: "ASR",
      capabilities: { transcribe: { handler: "transcribe", timestamps: true } },
      models: [
        { id: "whisper", name: "Whisper" },
        { id: "qwen", name: "Qwen" },
      ],
    },
    {
      id: "unknown",
      name: "Unknown",
      capabilities: { transcribe: { handler: "transcribe" } },
    },
    {
      id: "none",
      name: "None",
      capabilities: {
        transcribe: { handler: "transcribe", timestamps: false },
      },
    },
  ];
  mockPackages = [plugin];
  await render();
  const rows = container.querySelectorAll(
    'table[aria-label="插件服务接口"] tbody tr'
  );
  expect(rows[0].cells[1].textContent).toContain("时间戳支持：支持");
  expect(
    rows[0].cells[1].querySelectorAll(".MuiTypography-caption")
  ).toHaveLength(1);
  expect(rows[0].cells[1].textContent).not.toMatch(/Whisper|Qwen/);
  expect(rows[0].cells[3].textContent).toMatch(/whisper/);
  expect(rows[0].cells[3].textContent).toMatch(/qwen/);
  expect(rows[1].cells[1].textContent).toContain("时间戳支持：未知");
  expect(rows[2].cells[1].textContent).toContain("时间戳支持：不支持");
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
        batch: [
          {
            id: "default",
            name: "Default",
            systemPrompt: "Batch",
            userPrompt: "{{items}}",
          },
        ],
        nobatch: [
          { id: "default", name: "Default", systemPrompt: "Single {{text}}" },
        ],
        dictionary: [
          { id: "default", name: "Default", userPrompt: "Dictionary" },
        ],
        subtitle: [
          { id: "default", name: "Default", systemPrompt: "Subtitle" },
        ],
        vlm: [{ id: "default", name: "Default", userPrompt: "Vision" }],
      },
    },
    {
      id: "dictionary",
      name: "Dictionary",
      capabilities: { dictionary: { handler: "dictionary" } },
    },
    { id: "tts", name: "TTS", capabilities: { speak: { handler: "speak" } } },
    {
      id: "decisions",
      name: "JEV",
      capabilities: { evaluate: { handler: "evaluate" } },
    },
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
    expect(buttons).toHaveLength(1);
    const rows = table.querySelectorAll("tbody tr");
    expect(rows[1].cells[2].textContent).toBe("—");
    expect(rows[3].cells[2].textContent).toBe("—");
    expect(table.querySelector("textarea")).toBeNull();
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    await act(async () => buttons[0].click());
    const preview = document.getElementById(
      buttons[0].getAttribute("aria-controls")
    );
    expect(preview.querySelector("td").colSpan).toBe(4);
    expect(preview.textContent).toContain("当前插件包的默认模板");
    expect(
      [...preview.querySelectorAll("h6")].map(
        (item) => item.textContent.split(" · ")[0]
      )
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
    expect(table.textContent).toContain("Single");
    await act(async () => buttons[0].click());
    expect(table.querySelector("textarea")).toBeNull();
    expect(table.textContent).not.toContain("插件未公开默认提示词");
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

test("installation needs only the normal install confirmation", async () => {
  saveProviderPackage.mockImplementationOnce(async (value) => {
    mockPackages = [value];
  });
  await render();
  await choose("导入文件夹");
  expect(saveProviderPackage).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmText: "安装插件" })
  );
  expect(container.textContent).toContain("已安装");
  expect(container.textContent).not.toContain("插件授权");
  expect(container.textContent).toContain("https://fixed.invalid");
  expect(container.textContent).not.toContain("API 地址字段");
  expect(container.textContent).not.toContain("API 基础地址");
  expect(container.textContent).not.toContain("实际请求地址由服务配置决定");
});

test("uninstall is confirmed through MUI hook and retains service snapshots", async () => {
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
      message: expect.stringContaining("已有实例及其配置仍保留"),
    })
  );
  expect(removeProviderPackage).toHaveBeenCalledWith("example-plugin");
});

test("updates use the normal confirmation", async () => {
  mockPackages = [pack()];
  readProviderDirectory.mockResolvedValue(pack("1.0.1"));
  await render();
  await choose("选择更新文件夹");
  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmText: "更新插件" })
  );
  expect(saveProviderPackage).toHaveBeenCalledTimes(1);
});

test("incompatible stored plugins show a warning and keep uninstall available", async () => {
  const plugin = pack();
  plugin.manifest.minHostVersion = "999999.0.0";
  mockPackages = [plugin];
  await render();
  expect(container.textContent).toContain(
    "Requires KISS Translator 999999.0.0"
  );
  const uninstall = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "卸载插件"
  );
  expect(uninstall.disabled).toBe(false);
  await act(async () => uninstall.click());
  expect(removeProviderPackage).toHaveBeenCalledWith(plugin.id);
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
