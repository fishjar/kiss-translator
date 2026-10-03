// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { exportDocument } from "../../../libs/document/export";
import { parseDocumentMarkdown } from "../../../libs/document/markdown";
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
  });
});
