import { zipSync, strToU8 } from "fflate";
import {
  DOCUMENT_CSS,
  documentMarkdown,
  renderDocumentMarkdown,
} from "./markdown";

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
let mathCssPromise;
async function embeddedMathCss() {
  mathCssPromise ||= (async () => {
    const base = new URL("assets/pdf/", document.baseURI),
      res = await fetch(new URL("katex.min.css", base));
    if (!res.ok) throw new Error("无法读取数学样式");
    let css = await res.text();
    const paths = [
      ...new Set(
        [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
          m[1].replace(/["']/g, "")
        )
      ),
    ];
    for (const path of paths) {
      const response = await fetch(new URL(path, base));
      if (!response.ok) throw new Error("无法嵌入数学字体");
      const url = await dataUrl(await response.blob());
      css = css.split(path).join(url);
    }
    return css;
  })().catch((e) => {
    mathCssPromise = null;
    throw e;
  });
  return mathCssPromise;
}
export async function exportDocument(
  blocks,
  mode,
  warnings,
  assets,
  name,
  format
) {
  let markdown = documentMarkdown(blocks, mode, warnings);
  const files = {};
  for (const asset of assets || []) {
    const path = `assets/${asset.name}`,
      replacement = format === "html" ? await dataUrl(asset.blob) : path;
    markdown = markdown.split(asset.url).join(replacement);
    files[path] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  let blob;
  if (format === "html") {
    const html = renderDocumentMarkdown(markdown),
      css = await embeddedMathCss();
    const title = name.replace(/[<>&"']/g, "");
    blob = new Blob(
      [
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${DOCUMENT_CSS}\n${css}</style></head><body>${html}</body></html>`,
      ],
      { type: "text/html;charset=utf-8" }
    );
  } else if (format === "zip") {
    files[`${name}.${mode}.md`] = strToU8(markdown);
    blob = new Blob([zipSync(files)], { type: "application/zip" });
  } else {
    // A standalone Markdown must not refer to a transient blob URL or a missing assets folder.
    for (const asset of assets || [])
      markdown = markdown
        .split(`assets/${asset.name}`)
        .join(await dataUrl(asset.blob));
    blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  }
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.${mode}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return blob;
}
