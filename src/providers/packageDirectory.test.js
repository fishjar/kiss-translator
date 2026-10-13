import { strToU8, zipSync } from "fflate";
import { readProviderDirectory, readProviderPackage } from "./package";
import { packageFingerprint } from "./packageFingerprint";

globalThis.TextEncoder ||= require("util").TextEncoder;
Object.defineProperty(globalThis, "crypto", {
  value: require("crypto").webcrypto,
  configurable: true,
});

const manifest = {
  manifestVersion: 1,
  apiVersion: "1",
  id: "directory-example",
  name: "Directory example",
  version: "1.0.0",
  services: [
    {
      id: "chat",
      implementation: { kind: "script", entry: "scripts/chat.js" },
      capabilities: { chat: { handler: "chat" } },
    },
    {
      id: "rules",
      implementation: { kind: "declarative", entry: "rules/chat.json" },
      capabilities: { chat: { handler: "chat" } },
    },
  ],
  resources: [{ id: "data", path: "assets/data.txt", mimeType: "text/plain" }],
  icon: "assets/icon.png",
};

function content() {
  return {
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "scripts/chat.js": strToU8("exports.chat = () => ({text:'ok'})"),
    "rules/chat.json": strToU8(
      JSON.stringify({
        rulesVersion: 1,
        handlers: { chat: { request: {}, response: { kind: "json" } } },
      })
    ),
    "assets/data.txt": strToU8("nested resource"),
    "assets/icon.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  };
}

function selected(files = content(), root = "插件目录") {
  return Object.entries(files).map(([path, bytes]) => ({
    webkitRelativePath: `${root}/${path}`,
    size: bytes.byteLength,
    arrayBuffer: jest.fn(async () => bytes.buffer),
  }));
}

test("directory and ZIP share parsing and fingerprints including nested entries, resources and icons", async () => {
  const directory = await readProviderDirectory(selected());
  const zip = readProviderPackage(zipSync(content()));
  expect(directory).toEqual({ ...zip, source: { kind: "directory" } });
  expect(await packageFingerprint(directory)).toBe(
    await packageFingerprint(zip)
  );
});

test("requires the manifest directly in the selected root and all referenced files", async () => {
  await expect(readProviderDirectory([])).rejects.toThrow("manifest.json");
  await expect(
    readProviderDirectory(selected({ "nested/manifest.json": strToU8("{}") }))
  ).rejects.toThrow("manifest.json");
  const files = content();
  delete files["scripts/chat.js"];
  await expect(readProviderDirectory(selected(files))).rejects.toThrow("entry");
});

test.each([
  "/root/manifest.json",
  "root/../manifest.json",
  "root/./manifest.json",
  "root//manifest.json",
  "root\\manifest.json",
  "C:/manifest.json",
  "manifest.json",
])("rejects invalid directory path %s", async (path) => {
  const files = selected();
  files[0].webkitRelativePath = path;
  await expect(readProviderDirectory(files)).rejects.toThrow();
  expect(files[0].arrayBuffer).not.toHaveBeenCalled();
});

test("rejects mixed roots and duplicate paths before reading", async () => {
  const files = selected();
  await expect(readProviderDirectory([...files, files[0]])).rejects.toThrow(
    "路径不能重复"
  );
  files[1].webkitRelativePath = "other/scripts/chat.js";
  await expect(readProviderDirectory(files)).rejects.toThrow("单个插件文件夹");
  expect(files[0].arrayBuffer).not.toHaveBeenCalled();
});

test("checks file count and declared total size before allocating buffers", async () => {
  const files = selected();
  await expect(
    readProviderDirectory(Array(101).fill(files[0]))
  ).rejects.toThrow("100");
  files[0].size = 10 * 1024 * 1024;
  await expect(readProviderDirectory(files)).rejects.toThrow("10 MiB");
  expect(files[0].arrayBuffer).not.toHaveBeenCalled();
});

test("checks actual bytes as well as reported sizes", async () => {
  const files = selected();
  files[0].arrayBuffer.mockResolvedValue(new ArrayBuffer(10 * 1024 * 1024 + 1));
  await expect(readProviderDirectory(files)).rejects.toThrow("10 MiB");
  expect(files[1].arrayBuffer).not.toHaveBeenCalled();
});

test("cancellation before and during reads prevents parsing and further reads", async () => {
  const files = selected();
  const controller = new AbortController();
  controller.abort();
  await expect(readProviderDirectory(files, controller.signal)).rejects.toThrow(
    "取消"
  );
  expect(files[0].arrayBuffer).not.toHaveBeenCalled();
  const during = new AbortController();
  files[0].arrayBuffer.mockImplementation(async () => {
    during.abort();
    return new ArrayBuffer(1);
  });
  await expect(readProviderDirectory(files, during.signal)).rejects.toThrow(
    "取消"
  );
  expect(files[1].arrayBuffer).not.toHaveBeenCalled();
});
