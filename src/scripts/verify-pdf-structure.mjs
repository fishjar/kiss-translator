import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const source = await fs.readFile("src/libs/pdf/structure.js");
const { rawPageFromText, buildLines, paragraphBlocks } = await import(
  `data:text/javascript;base64,${source.toString("base64")}`
);
for (const name of ["2601.01674v1.pdf", "2601.00597v2.pdf"]) {
  const pdf = await getDocument({
    data: new Uint8Array(await fs.readFile(`tmp/pdf/${name}`)),
    standardFontDataUrl:
      path.join(pdfRoot, "standard_fonts").replaceAll("\\", "/") + "/",
  }).promise;
  const counts = {
    name,
    pages: pdf.numPages,
    spans: 0,
    lines: 0,
    blocks: 0,
    headings: 0,
  };
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number),
      v = page.getViewport({ scale: 1 }),
      raw = rawPageFromText(await page.getTextContent(), v, number),
      lines = buildLines(raw),
      blocks = paragraphBlocks(raw, lines);
    assert.ok(blocks.length > 0, `page ${number} empty`);
    assert.equal(
      new Set(blocks.flatMap((b) => b.spanIds)).size,
      raw.spans.filter((s) => !s.vertical).length,
      `page ${number} lost or duplicated native spans`
    );
    if (name === "2601.01674v1.pdf" && number === 1) {
      const text = blocks.map((b) => b.text).join("\n");
      assert.ok(
        text.indexOf("The Higgs boson") <
          text.indexOf("The Muon Collider (MuCol)")
      );
      assert.ok(
        text.indexOf("The Muon Collider (MuCol)") <
          text.indexOf("simultaneously a precision"),
        "two-column order corrupted"
      );
      assert.ok(
        blocks.some(
          (b) =>
            b.type === "heading" &&
            b.text.includes("prospects for Future Colliders")
        ),
        "wrapped heading split"
      );
    }
    counts.spans += raw.spans.length;
    counts.lines += lines.length;
    counts.blocks += blocks.length;
    counts.headings += blocks.filter((b) => b.type === "heading").length;
  }
  console.log(JSON.stringify(counts));
  await pdf.destroy();
}
