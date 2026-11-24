import { updateEpubContainerPaths } from "./epubParser";
import { Uint8ArrayReader } from "@zip.js/zip.js";
import { strFromU8, strToU8 } from "fflate";
import { writeFileDownload } from "../../fileTranslation/fileOutput";
import { writeZipOutput } from "../zipOutput";
import { LARGE_EPUB_CHAPTER, storedEpubParts } from "./epubSections";
import {
  DEFAULT_EPUB_BILINGUAL_CSS,
  getRelativePath,
  injectCssIntoXhtml,
  injectFooterIntoXhtml,
  updateNavDocument,
  updateNcxDocument,
  updateOpfDocument,
} from "./epubPacker";

export function epubExportStyles(options) {
  let css = DEFAULT_EPUB_BILINGUAL_CSS;
  if (options.fontCss) {
    css += "\n" + options.fontCss + "\n";
  } else if (options.fontFamily === "serif") {
    css +=
      '\nbody, p, div {\n  font-family: SimSun, "Songti SC", "Source Han Serif CN", Georgia, serif;\n}\n';
  } else if (options.fontFamily === "kaiti") {
    css +=
      '\nbody, p, div {\n  font-family: KaiTi, "Kaiti SC", STKaiti, BiauKai, serif;\n}\n';
  }
  if (options.textStyleCode)
    css += "\n.kt-bilingual-target {\n  " + options.textStyleCode + "\n}\n";
  return css;
}

export async function downloadEpubArchive(
  book,
  states,
  load,
  getTitles,
  scene = {},
  options = {},
  mode = "bilingual"
) {
  const matches = (path) => {
    const state = states[path];
    return (
      state?.status === "done" &&
      (!state.targetLang || !scene.toLang || state.targetLang === scene.toLang)
    );
  };
  const hasTranslations = book.spineItems.some(({ fullPath }) =>
    matches(fullPath)
  );
  const get = async (path) => {
    if (!matches(path)) return undefined;
    const state = states[path];
    if (!state.stored) return state;
    const saved = await load?.(path);
    if (!saved) throw new Error(`找不到已保存的 EPUB 译文: ${path}`);
    return saved;
  };
  const outputLang =
    (hasTranslations && scene.toLang) || options.uiLang || "zh";
  const title = book.title || options.fallbackBaseName || "book";
  const suffix = hasTranslations
    ? mode === "target"
      ? (scene.toLang || "zh").toLowerCase().split("-")[0]
      : "bilingual"
    : "custom";
  const filename = `${title}.${suffix}.epub`;
  const cssHref = "styles/kiss-translator-epub.css";
  const cssPath = book.opfDir + cssHref;
  const spine = new Set(book.spineItems.map(({ fullPath }) => fullPath));
  const archive = book.archive;
  const pack = async (writer, signal) => {
    const addText = (path, text, extra) =>
      writer.add(path, new Uint8ArrayReader(strToU8(text)), {
        signal,
        ...extra,
      });
    await addText("mimetype", "application/epub+zip", {
      level: 0,
      extendedTimestamp: false,
      dataDescriptor: false,
      zip64: false,
    });
    await addText(cssPath, epubExportStyles(options));
    const titles = await getTitles(book, get, mode, signal, load);
    const readText = async (path) =>
      strFromU8(await archive.read(path, { cache: false, signal }));
    for (const path of archive.paths()) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (path === "mimetype" || path === cssPath) continue;
      if (path === "META-INF/container.xml") {
        const text = await readText(path);
        await addText(
          path,
          updateEpubContainerPaths(text, (entry) => archive.has(entry))
        );
        continue;
      }
      if (path === book.opfPath) {
        await addText(
          path,
          updateOpfDocument(await readText(path), {
            cssHref,
            toLang: hasTranslations ? scene.toLang : undefined,
            titleSuffix: hasTranslations
              ? mode === "target"
                ? " [译]"
                : " [双语对照]"
              : "",
          })
        );
        continue;
      }
      if (
        spine.has(path) ||
        path === book.navItemHref ||
        path === book.ncxItemHref
      ) {
        const result = await get(path);
        if (result?.parts) {
          const parts = storedEpubParts(result.parts, load, mode, signal);
          async function* exportParts() {
            let first = true;
            let hasFooter = false;
            for await (const part of parts) {
              if (first) {
                first = false;
                yield strToU8(
                  injectCssIntoXhtml(
                    part.prefix,
                    getRelativePath(path, cssPath)
                  )
                );
              }
              if (part.suffix !== undefined) {
                yield strToU8(
                  hasFooter || !spine.has(path)
                    ? part.suffix
                    : injectFooterIntoXhtml(part.suffix, outputLang)
                );
              } else {
                hasFooter ||= part.body.includes("kt-epub-footer");
                yield strToU8((part.before || "") + part.body);
              }
            }
          }
          const iterator = exportParts();
          const readable = new ReadableStream({
            async pull(controller) {
              const { value, done } = await iterator.next();
              if (done) controller.close();
              else controller.enqueue(value);
            },
            async cancel() {
              await iterator.return();
            },
          });
          await writer.add(path, readable, { signal });
          continue;
        }
        if (
          result ||
          archive.size(path) <= LARGE_EPUB_CHAPTER ||
          path === book.navItemHref ||
          path === book.ncxItemHref
        ) {
          const translated =
            mode === "target"
              ? result?.targetXhtml || result?.targetHtml
              : result?.bilingualXhtml || result?.bilingualHtml;
          let content = translated || (await readText(path));
          if (!translated && titles.size) {
            const dir = path.slice(0, path.lastIndexOf("/") + 1);
            if (path === book.navItemHref)
              content = updateNavDocument(content, titles, dir);
            if (path === book.ncxItemHref)
              content = updateNcxDocument(content, titles, dir);
          }
          if (path !== book.ncxItemHref) {
            content = injectCssIntoXhtml(
              content,
              getRelativePath(path, cssPath)
            );
            if (spine.has(path))
              content = injectFooterIntoXhtml(content, outputLang);
          }
          await addText(path, content);
          continue;
        }
      }
      const relay = new TransformStream();
      const abort = new AbortController();
      const cancel = () => abort.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      const forward = archive.stream(path, relay.writable, abort.signal);
      const add = writer.add(path, relay.readable, { signal: abort.signal });
      try {
        await Promise.all([forward, add]);
      } catch (error) {
        cancel();
        await Promise.allSettled([forward, add]);
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    }
  };
  await writeFileDownload(
    filename,
    "application/epub+zip",
    (writable) => writeZipOutput(writable, options.signal, pack),
    { large: options.large, signal: options.signal }
  );
}
