// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { exportDocument } from "../../../libs/document/export";
import { writeFileChunks, writeFileDownload } from "../../../fileTranslation/fileOutput";
import { parseDocumentMarkdown, translateDocumentBlocks } from "../../../libs/document/markdown";
function read(blob: Blob, binary = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    binary ? reader.readAsArrayBuffer(blob) : reader.readAsText(blob);
  });
}
const asset = () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  Object.assign(blob, {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  return { name: "page-1.png", url: "blob:original-page", blob };
};
function setup() {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:download"),
      revokeObjectURL: vi.fn(),
    })
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("document export resources", () => {
  it("fails an export when a completed block has lost its stored translation", async () => {
    setup();
    const blocks = parseDocumentMarkdown("Original paragraph");
    Object.assign(blocks[0], { status: "done", storedTranslation: "missing" });
    const loadTranslation = vi.fn(async () => undefined);
    await expect(exportDocument(blocks, "target", [], [], "document", "md", {
      loadTranslation,
    })).rejects.toThrow("找不到已保存的文档译文");
    expect(loadTranslation).toHaveBeenCalledWith("missing");
    await expect(exportDocument(blocks, "bilingual", [], [], "document", "md"))
      .rejects.toThrow("找不到已保存的文档译文");
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    const original = await exportDocument(blocks, "source", [], [], "document", "md");
    expect(await read(original as Blob)).toContain("Original paragraph");
  });

  it("does not begin writing when a save picker resolves after cancellation", async () => {
    const abort = new AbortController();
    const createWritable = vi.fn();
    let accept!: (handle: { createWritable: typeof createWritable }) => void;
    vi.stubGlobal("showSaveFilePicker", vi.fn(() => new Promise((resolve) => {
      accept = resolve;
    })));
    const write = vi.fn();
    const saving = writeFileDownload("test.txt", "text/plain", write, {
      large: true,
      signal: abort.signal,
    });
    abort.abort();
    accept({ createWritable });
    await expect(saving).rejects.toMatchObject({ name: "AbortError" });
    expect(createWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the OPFS download available past 30 seconds", async () => {
    setup();
    vi.useFakeTimers();
    vi.stubGlobal("crypto", { randomUUID: () => "export-test" });
    const removeEntry = vi.fn(async () => {});
    const directory = {
      async *entries() {},
      removeEntry,
      async getFileHandle() {
        return {
          async createWritable() { return new WritableStream(); },
          async getFile() { return new Blob(["abc"], { type: "text/plain" }); },
        };
      },
    };
    vi.stubGlobal("navigator", {
      storage: { async getDirectory() {
        return { async getDirectoryHandle() { return directory; } };
      } },
    });
    try {
      await writeFileDownload("test.txt", "text/plain", (output) =>
        writeFileChunks(output, [new TextEncoder().encode("abc")]), { large: true }
      );
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(removeEntry).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(removeEntry).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("streams archived PDF assets one at a time from the session store", async () => {
    setup();
    const image = asset();
    const loadAsset = vi.fn(async () => image.blob);
    const blocks = parseDocumentMarkdown("Before ![crop](assets/page-1.png) after");
    const output = await exportDocument(
      blocks, "source", [], [{ name: image.name, storedBlob: "asset:1", size: 3 }],
      "stored", "zip", { loadAsset }
    );
    const files = unzipSync(new Uint8Array(await read(output, true)));
    expect(loadAsset).toHaveBeenCalledWith("asset:1");
    expect(files["assets/page-1.png"]).toEqual(new Uint8Array([1, 2, 3]));
    expect(strFromU8(files["stored.source.md"])).toContain("assets/page-1.png");
  });

  it("embeds inline formula fallback crops without losing surrounding prose", async () => {
    setup();
    const output = await exportDocument(parseDocumentMarkdown("Before ![原公式](blob:original-page) after"),
      "source", [], [asset()], "formula", "md");
    const text = await read(output);
    expect(text).toContain("Before ![原公式](data:image/png;base64,AQID) after");
    expect(text).not.toContain("blob:original-page");
  });
  it("replaces transient preview URLs with embedded standalone Markdown resources", async () => {
    setup();
    const output = await exportDocument(
      parseDocumentMarkdown("![Figure](blob:original-page)"),
      "source",
      [{ message: "检查图表" }],
      [asset()],
      "paper",
      "md"
    );
    const text = await read(output);
    expect(text).toContain("data:image/png;base64,AQID");
    expect(text).not.toContain("blob:original-page");
    expect(text).toContain("检查图表");
  });
  it("embeds repeated links once per chunk and leaves unlinked resource names alone", async () => {
    setup();
    const image = asset();
    const loadAsset = vi.fn(async () => image.blob);
    const blocks = parseDocumentMarkdown(
      "Text assets/page-1.png ![A](assets/page-1.png) ![B](blob:original-page)"
    );
    const output = await exportDocument(blocks, "source", [], [
      { name: image.name, url: image.url, storedBlob: "used", size: 3 },
      { name: "unlinked.png", storedBlob: "unused", size: 3 },
    ], "paper", "md", { loadAsset });
    const text = await read(output as Blob);
    expect(text).toContain("Text assets/page-1.png");
    expect(text.match(/data:image\/png;base64,AQID/g)).toHaveLength(2);
    expect(loadAsset.mock.calls).toEqual([["used"]]);
  });
  it("packages ZIP resources under assets with matching Markdown paths", async () => {
    setup();
    const output = await exportDocument(
      parseDocumentMarkdown("![Figure](blob:original-page)"),
      "source",
      [],
      [asset()],
      "paper",
      "zip"
    );
    const files = unzipSync(new Uint8Array(await read(output, true)));
    expect(Object.keys(files)).toEqual([
      "assets/page-1.png",
      "paper.source.md",
    ]);
    expect(strFromU8(files["paper.source.md"])).toContain("assets/page-1.png");
    expect(Array.from(files["assets/page-1.png"])).toEqual([1, 2, 3]);
  });
  it("embeds math fonts and images in sanitized standalone HTML", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({
        ok: true,
        text: async () => "@font-face{src:url(fonts/test.woff2)}",
        blob: async () => new Blob(["font"], { type: "font/woff2" }),
      }))
    );
    const output = await exportDocument(
      parseDocumentMarkdown(
        "$x^2$\n\n![Figure](blob:original-page)\n\n<script>alert(1)</script>"
      ),
      "source",
      [],
      [asset()],
      "paper",
      "html"
    );
    const html = await read(output);
    expect(html).toContain("katex");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("data:image/png;base64,AQID");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("blob:original-page");
    expect(html).not.toContain("url(fonts/");
    expect(html).toContain("overflow-x:auto;overflow-y:hidden;padding:.5em 0;height:auto");
  });
});

it("exports complete paragraph fallback pixels and its issue without residual fragments", async () => {
  setup();
  const blocks = parseDocumentMarkdown("![原文段落回退](blob:original-page)");
  const warnings = [{ regionId: "body", message: "字符映射失败，保留完整段落" }];
  const md = await read(await exportDocument(blocks, "source", warnings, [asset()], "paragraph", "md"));
  expect(md).toContain("![原文段落回退](data:image/png;base64,AQID)");
  expect(md).toContain(warnings[0].message);
  const zip = await exportDocument(blocks, "source", warnings, [asset()], "paragraph", "zip");
  const files = unzipSync(new Uint8Array(await read(zip, true)));
  expect(strFromU8(files["paragraph.source.md"])).toContain("![原文段落回退](assets/page-1.png)");
  expect(files["assets/page-1.png"]).toEqual(new Uint8Array([1, 2, 3]));
});


it("exports right-aligned formula tags and same-row image numbers without preview controls", async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => ".katex{}" })));
  const raw = "$$\nx^2\\tag{1}\n$$\n\n![原公式](blob:original-page) (2)";
  const output = await exportDocument(parseDocumentMarkdown(raw), "source", [], [asset()], "numbered", "html");
  const html = await read(output);
  expect(html).toContain('class="tag"');
  expect(html).toContain('class="kt-equation-fallback"');
  expect(html).toContain('class="kt-equation-number"');
  expect(html).toContain("data:image/png;base64,AQID");
  expect(html).not.toContain("data-pdf-source");
  expect(html).not.toContain("定位原文");
});

for (const format of ["md", "zip", "html"]) it(`exports stable fallback paths as ${format} without a preview URL`, async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => ".katex{}" })));
  const resource = asset();
  delete resource.url;
  const output = await exportDocument(parseDocumentMarkdown("Before ![crop](assets/page-1.png) after"),
    "source", [], [resource], "stable", format);
  const text = format === "zip" ? strFromU8(unzipSync(new Uint8Array(await read(output, true)))["stable.source.md"]) : await read(output);
  expect(text).not.toContain("blob:");
  expect(text).toContain(format === "zip" ? "assets/page-1.png" : "data:image/png;base64,AQID");
});

for (const format of ["md", "zip", "html"]) it(`retains bilingual inline math and images in ${format} export`, async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => ".katex{}" })));
  const blocks = parseDocumentMarkdown("Before $x$ ![crop](assets/page-1.png) after");
  await translateDocumentBlocks(blocks, async (text) => text.replace("Before", "Translated"), new AbortController().signal);
  const output = await exportDocument(blocks, "bilingual", [], [asset()], "bilingual", format);
  const text = format === "zip" ? strFromU8(unzipSync(new Uint8Array(await read(output, true)))["bilingual.bilingual.md"]) : await read(output);
  expect(text).not.toContain("blob:");
  const dom = document.createElement("div"); dom.innerHTML = text;
  const mathCount = format === "html" ? dom.querySelectorAll(".katex").length : (text.match(/\$x\$/g) || []).length;
  const resourcePattern = format === "zip" ? /assets\/page-1.png/g : /data:image\/png;base64,AQID/g;
  const imageCount = format === "html" ? dom.querySelectorAll("img").length : (text.match(resourcePattern) || []).length;
  expect(mathCount).toBe(2);
  expect(imageCount).toBe(2);
});
