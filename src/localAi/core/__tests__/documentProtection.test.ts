// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { documentMarkdown, parseDocumentMarkdown, renderDocumentBlock, restoreDocumentBilingual, translateDocumentBlocks } from "../../../libs/document/markdown";

it("protects requests and restores every inline resource in both bilingual halves", async () => {
  const blocks = parseDocumentMarkdown("Text $x^2$ and $x^2$ `secret-code` ![crop](assets/crop.png) [Guide](https://example.com/private) note[^a].\n\n[^a]: Footnote");
  const translate = vi.fn(async (text) => text.replace("Text", "Translated"));
  await translateDocumentBlocks(blocks, translate, new AbortController().signal);
  const input = translate.mock.calls[0][0];
  expect(blocks[0].status).toBe("done");
  expect(input).toContain("Text");
  for (const value of ["x^2", "secret-code", "assets/crop.png", "https://example.com/private", "[^a]"]) expect(input).not.toContain(value);
  expect(input.match(/KTDOCMASK\d+END/g)).toHaveLength(6);
  const bilingual = documentMarkdown(blocks, "bilingual");
  expect(bilingual.match(/\$x\^2\$/g)).toHaveLength(4);
  expect(bilingual.match(/assets\/crop.png/g)).toHaveLength(2);
  expect(bilingual.match(/`secret-code`/g)).toHaveLength(2);
});
it("keeps Markdown image references and footnote identities intact", async () => {
  const blocks = parseDocumentMarkdown("Text ![crop][image] note[^a].\n\n[image]: assets/crop.png\n\n[^a]: Footnote");
  const translate = vi.fn(async (text) => text.replace("Text", "Translated"));
  await translateDocumentBlocks(blocks, translate, new AbortController().signal);
  expect(blocks[0].status).toBe("done");
  expect(blocks[0].targetAst.children.some((node) => node.type === "imageReference" && node.identifier === "image")).toBe(true);
  expect(blocks[0].targetAst.children.some((node) => node.type === "footnoteReference" && node.identifier === "a")).toBe(true);
});
it("protects marked HTML spans inside Markdown paragraphs", async () => {
  const blocks = parseDocumentMarkdown('Text <span translate="no">fixed <sub>i</sub></span> and <kbd>Ctrl</kbd>.');
  const translate = vi.fn(async (text) => text.replace("Text", "Translated"));
  await translateDocumentBlocks(blocks, translate, new AbortController().signal);
  expect(blocks[0].status).toBe("done");
  expect(translate.mock.calls[0][0]).not.toContain("fixed");
  expect(translate.mock.calls[0][0]).not.toContain("Ctrl");
  expect(blocks[0].bilingualRaw.match(/fixed/g)).toHaveLength(2);
});
it("flags incomplete legacy targets without automatically translating them", async () => {
  const block = parseDocumentMarkdown("Text $x$")[0];
  block.status = "done"; block.targetAst = parseDocumentMarkdown("Translated without math")[0].ast;
  const translate = vi.fn(async (text) => text);
  expect(restoreDocumentBilingual(block).translationRepairRequired).toBe(true);
  await translateDocumentBlocks([block], translate, new AbortController().signal);
  expect(translate).not.toHaveBeenCalled();
  expect(block.status).toBe("error");
  await translateDocumentBlocks([block], translate, new AbortController().signal);
  expect(translate).toHaveBeenCalledTimes(1);
  expect(block.status).toBe("done");
});
it("rebuilds legacy HTML and rejects missing inline math", () => {
  const block = parseDocumentMarkdown('<div>Text $x$ <code>fixed</code><img src="assets/crop.png"></div>')[0];
  block.status = "done";
  block.targetRaw = '<div>Translated $x$ <code>fixed</code><img src="assets/crop.png"></div>';
  const restored = restoreDocumentBilingual(block);
  expect(restored.bilingualRaw.match(/<img/g)).toHaveLength(2);
  expect(restored.bilingualRaw.match(/\$x\$/g)).toHaveLength(2);
  block.targetRaw = block.targetRaw.replace("$x$", "");
  expect(restoreDocumentBilingual(block).status).toBe("error");
});
it("rejects duplicated placeholders and restores only the failed block on retry", async () => {
  const blocks = parseDocumentMarkdown("Plain\n\nText $x$");
  await translateDocumentBlocks(blocks, async (text) => text.replace("KTDOCMASK0END", "KTDOCMASK0END KTDOCMASK0END"), new AbortController().signal);
  expect(blocks.map((block) => block.status)).toEqual(["done", "error"]);
  const retry = vi.fn(async (text) => text);
  await translateDocumentBlocks(blocks, retry, new AbortController().signal);
  expect(retry).toHaveBeenCalledTimes(1);
});
it("protects outermost HTML resources without orphaned nested placeholders", async () => {
  const raw = '<div>Translate <pre><code>secret</code></pre><svg><text>diagram</text></svg><sup>power</sup><sub>index</sub><kbd>Ctrl</kbd><samp>output</samp><span translate="no">fixed</span><span class="notranslate">unchanged</span></div>';
  const blocks = parseDocumentMarkdown(raw), translate = vi.fn(async (text) => text.replace("Translate", "Translated"));
  await translateDocumentBlocks(blocks, translate, new AbortController().signal);
  expect(blocks[0].status).toBe("done");
  const input = translate.mock.calls[0][0];
  for (const value of ["secret", "diagram", "power", "index", "Ctrl", "output", "fixed", "unchanged"]) expect(input).not.toContain(value);
  expect(blocks[0].bilingualRaw.match(/<code>/g)).toHaveLength(2);
  expect(blocks[0].bilingualRaw.match(/<svg>/g)).toHaveLength(2);
});
it("preserves standalone resources once and flags damaged placeholders", async () => {
  const blocks = parseDocumentMarkdown("![standalone](assets/figure.png)\n\nText $x$");
  await translateDocumentBlocks(blocks, async (text) => text.replace(/KTDOCMASK\d+END/g, "lost"), new AbortController().signal);
  expect(blocks[1].status).toBe("error");
  expect(documentMarkdown(blocks, "bilingual").match(/assets\/figure.png/g)).toHaveLength(1);
});
it("rebuilds a legacy bilingual AST from its complete target without calling translation", async () => {
  const block = parseDocumentMarkdown("Before $x$ ![crop](assets/crop.png)")[0];
  block.status = "done";
  block.targetAst = parseDocumentMarkdown("After $x$ ![crop](assets/crop.png)")[0].ast;
  block.targetRaw = "After $x$ ![crop](assets/crop.png)";
  block.bilingualRaw = "Before $x$ ![crop](assets/crop.png)\nAfter";
  block.bilingualAst = parseDocumentMarkdown(block.bilingualRaw)[0].ast;
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "bilingual");
  expect(dom.querySelectorAll(".katex")).toHaveLength(2);
  expect(dom.querySelectorAll("img")).toHaveLength(2);
  expect(documentMarkdown([block], "bilingual").match(/assets\/crop.png/g)).toHaveLength(2);
});
