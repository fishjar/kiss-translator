import { BlobReader, Uint8ArrayReader } from "@zip.js/zip.js";
import {
  writeFileChunks,
  writeFileDownload,
} from "../../fileTranslation/fileOutput";
import { writeZipOutput } from "../zipOutput";
import {
  DOCUMENT_CSS,
  blockMarkdown,
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
async function zipBlobReader(blob) {
  if (typeof blob.slice(0, 0).arrayBuffer === "function")
    return new BlobReader(blob);
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8ArrayReader(new Uint8Array(buffer));
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
  format,
  { loadTranslation, loadAsset, signal } = {}
) {
  const check = () => {
    if (signal?.aborted) throw signal.reason;
  };
  if (
    mode !== "source" &&
    !loadTranslation &&
    blocks.some((block) => block.storedTranslation)
  )
    throw new Error("找不到已保存的文档译文");
  const estimatedText = blocks.reduce(
    (sum, block) =>
      sum + (block.bilingualRaw?.length || block.raw?.length || 0),
    0
  );
  const bytes = (assets || []).reduce(
    (sum, asset) => sum + (asset.blob?.size ?? asset.size ?? 0),
    estimatedText * 3
  );
  const large = bytes >= 32 * 1024 ** 2;
  const title = name.replace(/[<>&"']/g, "");
  const fileName = name + "." + mode + "." + format;
  const encoder = new TextEncoder();
  const assetLinks = new Map();
  for (const asset of assets || []) {
    assetLinks.set("assets/" + asset.name, asset);
    if (asset.url) assetLinks.set(asset.url, asset);
  }
  async function assetData(asset) {
    const data = asset.blob || (await loadAsset?.(asset.storedBlob));
    if (!data) throw new Error(`找不到 PDF 资源：${asset.name}`);
    return data;
  }
  const encode = (text) => encoder.encode(text);
  const type =
    format === "zip"
      ? "application/zip"
      : format === "html"
        ? "text/html;charset=utf-8"
        : "text/markdown;charset=utf-8";
  const encapsulate = async function* () {
    const css = await embeddedMathCss();
    check();
    yield encode(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        title +
        "</title><style>" +
        DOCUMENT_CSS +
        "\n" +
        css +
        "</style></head><body>"
    );
    yield* chunks();
    yield encode("</body></html>");
  };
  async function* chunks(exportSignal = signal) {
    const checkExport = () => {
      if (exportSignal?.aborted) throw exportSignal.reason;
    };
    async function render(markdown) {
      const parts = [];
      const rendered = new Map();
      let start = 0;
      const links =
        /((?:\]\(|^ {0,3}\[[^\]\n]+\]:)[ \t]*<?|\b(?:src|href)\s*=\s*["'])([^\s"'<>)]{1,})/gm;
      for (const match of markdown.matchAll(links)) {
        const asset = assetLinks.get(match[2]);
        if (!asset) continue;
        checkExport();
        if (!rendered.has(asset)) {
          rendered.set(
            asset,
            format === "zip"
              ? "assets/" + asset.name
              : await dataUrl(await assetData(asset))
          );
        }
        const position = match.index + match[1].length;
        parts.push(markdown.slice(start, position), rendered.get(asset));
        start = position + match[2].length;
      }
      if (start) {
        parts.push(markdown.slice(start));
        markdown = parts.join("");
      }
      checkExport();
      return format === "html" ? renderDocumentMarkdown(markdown) : markdown;
    }

    // Preserve the complete Markdown context for small standalone documents.
    if (!large && !loadTranslation && format !== "zip") {
      yield encode(await render(documentMarkdown(blocks, mode, warnings)));
      return;
    }
    let first = true;
    for (const block of blocks) {
      checkExport();
      const result =
        mode !== "source" && block.storedTranslation
          ? await loadTranslation?.(block.storedTranslation)
          : null;
      if (mode !== "source" && block.storedTranslation && !result)
        throw new Error("找不到已保存的文档译文");
      const markdown = blockMarkdown(
        result ? { ...block, ...result } : block,
        mode
      );
      yield encode(
        (first || format === "html" ? "" : "\n\n") +
          (await render(markdown || block.raw))
      );
      first = false;
    }
    const notes = documentMarkdown([], mode, warnings);
    if (notes) yield encode(await render(notes));
  }
  return writeFileDownload(
    fileName,
    type,
    async (writable) => {
      check();
      if (format !== "zip") {
        await writeFileChunks(
          writable,
          format === "html" ? encapsulate() : chunks()
        );
        return;
      }
      await writeZipOutput(writable, signal, async (writer, exportSignal) => {
        for (const asset of assets || []) {
          if (exportSignal.aborted) throw exportSignal.reason;
          await writer.add(
            "assets/" + asset.name,
            await zipBlobReader(await assetData(asset)),
            { signal: exportSignal }
          );
        }
        const iterator = chunks(exportSignal);
        const source = new ReadableStream({
          async pull(controller) {
            const value = await iterator.next();
            if (value.done) controller.close();
            else controller.enqueue(value.value);
          },
          cancel() {
            return iterator.return();
          },
        });
        await writer.add(name + "." + mode + ".md", source, {
          signal: exportSignal,
        });
      });
    },
    { large, signal }
  );
}
