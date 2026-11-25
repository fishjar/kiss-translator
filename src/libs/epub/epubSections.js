import { SaxesParser } from "saxes";
import { parseXhtmlToDoc, serializeDocToXhtml } from "./epubDomHandler";

export const LARGE_EPUB_CHAPTER = 2 * 1024 ** 2;
export const epubPartKey = (id, index) => `part:${id}:${index}`;
const SECTION_LENGTH = 48 * 1024;
const MAX_STRUCTURAL_BLOCK = 4 * 1024 ** 2;

export class EpubChapterStructureError extends Error {}

export async function* storedEpubParts(parts, load, mode, signal) {
  if (mode !== "bilingual" && mode !== "target")
    throw new Error("无效的 EPUB 译文分块模式");
  for (let index = 0; index < parts.count; index++) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const part = await load?.(epubPartKey(parts.id, index));
    if (!part || typeof part[mode] !== "string")
      throw new Error("找不到已保存的 EPUB 译文分块");
    yield {
      prefix: parts.prefix,
      tail: part.tail ?? parts.tail,
      opener: part.opener,
      before: part.before,
      body: part[mode],
    };
  }
  let { prefix, suffix } = parts;
  if (parts.count === 0) {
    const body = prefix.match(
      /<((?:[\w.-]+:)?body)\b(?:[^<>"']|"[^"]*"|'[^']*')*\/>$/i
    );
    if (body) {
      prefix = prefix.slice(0, -2) + ">";
      suffix = `</${body[1]}>` + suffix;
    }
  }
  yield { prefix, suffix, body: "" };
}

export const epubPartMarkup = (part) =>
  part.prefix + (part.opener || "") + part.body + part.tail;

export function epubPartRoot(doc, part) {
  const body = doc.body || doc.getElementsByTagNameNS("*", "body")[0];
  const root = part.opener ? body?.firstElementChild : body;
  if (!root) throw new Error("EPUB 章节缺少有效的 XHTML 正文");
  return root;
}

// Preserve the original document edges and split only between complete blocks.
export async function* splitEpubBody(chunks, signal) {
  const parser = new SaxesParser({ xmlns: false });
  let offset = 0;
  let buffered = "";
  let prefix;
  let depth = 0;
  let bodyDepth = 0;
  let bodyEnded = false;
  const openTags = [];
  let tail, wrapper;
  let before = "";
  const take = (end) => {
    if (end - offset > MAX_STRUCTURAL_BLOCK)
      throw new EpubChapterStructureError(
        "此 EPUB 包含超过处理上限的单个 XHTML 结构块"
      );
    const text = buffered.slice(0, end - offset);
    buffered = buffered.slice(end - offset);
    offset = end;
    return text;
  };
  const output = [];
  const emit = (end) => {
    const body = take(end);
    if (!body && !(wrapper && before)) return;
    output.push({
      prefix,
      tail: wrapper ? `</${wrapper.name}>${tail}` : tail,
      opener: wrapper?.opener,
      before,
      body,
    });
    before = "";
  };
  parser.on("error", (error) => {
    throw new EpubChapterStructureError(
      `EPUB 章节 XHTML 无效: ${error.message}`
    );
  });
  parser.on("opentag", (tag) => {
    depth++;
    openTags.push(tag.name);
    if (!bodyDepth && !bodyEnded && /(^|:)body$/i.test(tag.name)) {
      bodyDepth = depth;
      prefix = take(parser.position);
      tail = [...openTags]
        .reverse()
        .map((name) => "</" + name + ">")
        .join("");
      if (tag.isSelfClosing) {
        prefix = prefix.slice(0, -2) + ">";
        before = `</${tag.name}>`;
        bodyEnded = true;
        bodyDepth = 0;
      }
    } else if (
      bodyDepth &&
      !wrapper &&
      depth === bodyDepth + 1 &&
      !tag.isSelfClosing &&
      /(^|:)(div|section|article|main)$/i.test(tag.name)
    ) {
      const start =
        offset + buffered.lastIndexOf("<", parser.position - offset - 1);
      emit(start);
      const opener = take(parser.position);
      wrapper = { name: tag.name, opener };
      before += opener;
    }
  });
  parser.on("closetag", () => {
    if (bodyDepth) {
      const blockDepth = bodyDepth + (wrapper ? 2 : 1);
      if (depth === blockDepth && parser.position - offset >= SECTION_LENGTH) {
        emit(parser.position);
      } else if (depth === blockDepth - 1) {
        const end =
          offset + buffered.lastIndexOf("</", parser.position - offset - 1);
        emit(end);
        if (wrapper) {
          before += take(parser.position);
          wrapper = undefined;
        } else {
          bodyEnded = true;
          bodyDepth = 0;
        }
      }
    }
    depth--;
    openTags.pop();
  });
  for await (const text of chunks) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    buffered += text;
    parser.write(text);
    if (buffered.length > MAX_STRUCTURAL_BLOCK)
      throw new EpubChapterStructureError(
        "此 EPUB 包含超过处理上限的单个 XHTML 结构块"
      );
    for (const part of output) yield part;
    output.length = 0;
  }
  parser.close();
  if (!prefix || !bodyEnded)
    throw new EpubChapterStructureError("EPUB 章节缺少有效的 XHTML 正文");
  yield { prefix, suffix: before + buffered, body: "" };
}

export async function* readEpubBody(archive, path, signal) {
  if (archive.size(path) <= MAX_STRUCTURAL_BLOCK) {
    const bytes = await archive.read(path, {
      cache: false,
      signal,
      maxBytes: MAX_STRUCTURAL_BLOCK,
    });
    if (!bytes) throw new Error(`找不到 EPUB 条目: ${path}`);
    const source = new TextDecoder().decode(bytes);
    const parts = [];
    try {
      for await (const part of splitEpubBody([source], signal))
        parts.push(part);
    } catch (error) {
      if (signal?.aborted || !(error instanceof EpubChapterStructureError))
        throw error;
      yield* splitEpubBody(
        [serializeDocToXhtml(parseXhtmlToDoc(source))],
        signal
      );
      return;
    }
    yield* parts;
    return;
  }
  const relay = new TransformStream();
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const read = archive.stream(path, relay.writable, abort.signal);
  read.catch(() => {});
  const decoder = new TextDecoder();
  const reader = relay.readable.getReader();
  async function* decoded() {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  }
  try {
    yield* splitEpubBody(decoded(), abort.signal);
    await read;
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    signal?.removeEventListener("abort", cancel);
    await read.catch(() => {});
  }
}
