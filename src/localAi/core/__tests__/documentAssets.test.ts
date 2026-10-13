// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { DocumentAssetPreview, normalizeDocumentAssets } from "../../../libs/document/assets";
import { parseDocumentMarkdown, renderDocumentBlock } from "../../../libs/document/markdown";

afterEach(() => vi.unstubAllGlobals());
function setup() {
  let serial = 0;
  const create = vi.fn(() => `blob:preview-${++serial}`), revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  return { create, revoke, registry: new DocumentAssetPreview(),
    asset: { name: "crop.png", url: "blob:revoked", blob: new Blob(["crop"], { type: "image/png" }) } };
}
it("migrates all reading modes and AST resources, retaining anchors and model diagnostics", () => {
  const { asset } = setup();
  const original = { assets: [asset], blocks: [{ raw: "![crop](blob:revoked)", targetRaw: "![crop](blob:revoked)",
    bilingualRaw: "![crop](blob:revoked)", ast: { type: "image", url: "blob:revoked", data: { pdfSourceIds: ["formula"] } },
    formulaDiagnostics: [{ output: "blob:revoked" }] }] };
  const result = normalizeDocumentAssets(original, original.assets);
  expect(result.assets[0].blob).toBe(asset.blob);
  expect(result.blocks[0].raw).toBe("![crop](assets/crop.png)");
  expect(result.blocks[0].targetRaw).toBe(result.blocks[0].raw);
  expect(result.blocks[0].bilingualRaw).toBe(result.blocks[0].raw);
  expect(result.blocks[0].ast.url).toBe("assets/crop.png");
  expect(result.blocks[0].ast.data.pdfSourceIds).toEqual(["formula"]);
  expect(result.blocks[0].formulaDiagnostics[0].output).toBe("blob:revoked");
  expect(original.blocks[0].ast.url).toBe("blob:revoked");
});
it("reuses Blob identity and restores retained assets after cleanup without cropping", () => {
  const { registry, asset, create, revoke } = setup();
  registry.sync([asset])();
  registry.sync([asset])();
  expect(create).toHaveBeenCalledTimes(1);
  registry.clear();
  registry.sync([asset])();
  expect(registry.urls().get("assets/crop.png")).toBe("blob:preview-2");
  expect(revoke).toHaveBeenCalledWith("blob:preview-1");
});
it("publishes replacement URLs before retiring old resources", () => {
  const { registry, asset, revoke } = setup();
  registry.sync([asset])();
  const release = registry.sync([{ ...asset, blob: new Blob(["new"]) }]);
  expect(registry.urls().get("assets/crop.png")).toBe("blob:preview-2");
  expect(revoke).not.toHaveBeenCalledWith("blob:preview-1");
  release();
  expect(revoke).toHaveBeenCalledWith("blob:preview-1");
});
it("retries a failed URL once, ignores stale errors, and terminates second failures", () => {
  const { registry, asset, create } = setup();
  registry.sync([asset])();
  expect(registry.retry("assets/crop.png", "blob:preview-1")).toBe("blob:preview-2");
  expect(registry.retry("assets/crop.png", "blob:preview-1")).toBeNull();
  expect(registry.retry("assets/crop.png", "blob:preview-2")).toBeNull();
  expect(registry.urls().get("assets/crop.png")).toBeNull();
  registry.sync([asset])();
  expect(create).toHaveBeenCalledTimes(2);
});
it("renders only owned assets and preserves fallback source positioning on missing Blob", () => {
  const { registry } = setup();
  registry.sync([{ name: "crop.png" }])();
  const blocks = parseDocumentMarkdown("Before ![crop](assets/crop.png) after ![foreign](https://example.com/a.png)");
  const view = renderDocumentBlock(blocks[0], "source", [], [], registry.urls(), "Resource failed");
  expect(view).not.toContain("<img");
  expect(view).toContain("Resource failed");
  expect(view).toContain("Before");
  expect(view).toContain("after");
});
it("resolves inline and numbered screenshots without modifying copied Markdown", () => {
  const { registry, asset } = setup();
  registry.sync([asset])();
  for (const raw of ["Before ![crop](assets/crop.png) after", "![crop](assets/crop.png) (4)"]) {
    const block = parseDocumentMarkdown(raw)[0];
    const view = renderDocumentBlock(block, "source", [], [], registry.urls());
    expect(view).toContain('src="blob:preview-1"');
    expect(view).toContain('data-document-asset="assets/crop.png"');
    expect(block.raw).toBe(raw);
  }
});
