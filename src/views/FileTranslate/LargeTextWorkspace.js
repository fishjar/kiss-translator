import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import DOMPurify from "dompurify";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { createDocumentSession } from "../../fileTranslation/documentSession";
import { readTextSections } from "../../fileTranslation/textSections";
import {
  writeFileChunks,
  writeFileDownload,
} from "../../fileTranslation/fileOutput";
import {
  generateStandaloneHtml,
  escapeHtmlText,
  renderMarkdownBlocksToHtml,
  splitMarkdownBlocks,
  translateMarkdown,
  translateTxt,
} from "../../libs/fileTranslate";
import {
  useDocumentWindow,
  useMeasuredDocumentItem,
} from "./useDocumentWindow";

function TextSection({
  session,
  index,
  settingsKey,
  revision,
  markdown,
  measure,
  viewMode,
}) {
  const element = useRef(null);
  const [section, setSection] = useState(null);
  useMeasuredDocumentItem(element, index, measure);
  useEffect(() => {
    let active = true;
    setSection(null);
    Promise.all([
      session.get(`source:${index}`),
      session.get(`translation:${settingsKey}:${index}`),
    ])
      .then(([source, translation]) => {
        if (active && source) setSection({ ...source, translation });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session, index, settingsKey, revision]);
  const render = (text) =>
    markdown && !section?.raw ? (
      <div
        dangerouslySetInnerHTML={{
          __html: markdownHtml((section.tableHead || "") + text),
        }}
      />
    ) : (
      <pre
        style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {text}
      </pre>
    );
  return (
    <section
      ref={element}
      style={{
        display: "grid",
        gridTemplateColumns: viewMode === "bilingual" ? "1fr 1fr" : "1fr",
        gap: 16,
        padding: 12,
        minHeight: section ? 0 : 360,
      }}
    >
      {viewMode !== "target" && (
        <div style={{ minWidth: 0 }}>{section && render(section.text)}</div>
      )}
      {viewMode !== "source" && (
        <div style={{ minWidth: 0 }}>
          {section?.translation && render(section.translation.target)}
        </div>
      )}
    </section>
  );
}

const LargeTextWorkspace = forwardRef(function LargeTextWorkspace(
  {
    file,
    markdown,
    scene,
    setting,
    onError,
    viewMode,
    onViewMode,
    settingsKey,
    i18n,
  },
  ref
) {
  const active = useRef(null);
  const scroll = useRef(null);
  const body = useRef(null);
  const [session, setSession] = useState(null);
  const [count, setCount] = useState(0);
  const revisions = useRef(new Map());
  const [, setRevision] = useState(0);
  const windowed = useDocumentWindow(count, scroll, body, 360, 1, {
    documentKey: file,
    layoutKey: viewMode,
  });
  useEffect(() => {
    const store = createDocumentSession();
    const abort = new AbortController();
    const current = {
      store,
      signal: abort.signal,
      count: 0,
      done: false,
      listeners: new Set(),
    };
    active.current = current;
    setSession(store);
    setCount(0);
    revisions.current.clear();
    const wake = () => current.listeners.forEach((listener) => listener());
    current.indexed = (async () => {
      for await (const section of readTextSections(
        file,
        markdown,
        abort.signal
      )) {
        await store.put(`source:${current.count}`, section);
        if (abort.signal.aborted) return;
        setCount(++current.count);
        wake();
      }
    })()
      .catch((error) => {
        current.error = error;
        if (!abort.signal.aborted) onError(error.message);
      })
      .finally(() => {
        current.done = true;
        wake();
      });
    return () => {
      abort.abort();
      wake();
      store.close();
      if (active.current === current) active.current = null;
    };
  }, [file, markdown, onError]);

  useImperativeHandle(
    ref,
    () => ({
      async translate(signal, progress, refresh) {
        const current = active.current;
        if (!current) return;
        const { store } = current;
        for (let index = 0; ; index++) {
          if (
            index === current.count &&
            !current.done &&
            !signal.aborted &&
            active.current === current
          ) {
            await new Promise((resolve) => {
              const ready = () => {
                current.listeners.delete(ready);
                signal.removeEventListener("abort", ready);
                resolve();
              };
              current.listeners.add(ready);
              signal.addEventListener("abort", ready, { once: true });
            });
          }
          if (signal.aborted || active.current !== current)
            throw new DOMException("已取消", "AbortError");
          if (index === current.count) {
            if (current.error) throw current.error;
            break;
          }
          const key = `translation:${settingsKey}:${index}`;
          const previous = refresh ? null : await store.get(key);
          if (!previous) {
            const source = await store.get(`source:${index}`);
            const context = {
              kind: markdown ? "markdown" : "txt",
              cacheMode: refresh ? "refresh" : undefined,
            };
            const translated =
              source.raw || !source.text.trim()
                ? null
                : markdown
                  ? await translateMarkdown(
                      (source.tableHead || "") + source.text,
                      scene,
                      setting,
                      signal,
                      undefined,
                      context
                    )
                  : await translateTxt(
                      source.text,
                      scene,
                      setting,
                      signal,
                      undefined,
                      context
                    );
            if (signal.aborted || active.current !== current)
              throw new DOMException("已取消", "AbortError");
            const eol = source.text.match(/[\r\n]+$/)?.[0] || "";
            const target =
              source.tableHead && translated
                ? translated.text.split("\n").slice(2).join("\n")
                : (translated?.text ?? source.text);
            const result =
              markdown && translated && eol
                ? {
                    target: target.replace(/[\r\n]+$/, "") + eol,
                    bilingual:
                      translated.bilingualMd.replace(/[\r\n]+$/, "") + eol,
                  }
                : {
                    target,
                    bilingual:
                      translated?.bilingualMd ??
                      translated?.comparisons
                        .map(({ source, target }) => source + "\n" + target)
                        .join("\n\n") ??
                      source.text,
                  };
            await store.put(key, result);
            if (!signal.aborted && active.current === current) {
              revisions.current.set(
                index,
                (revisions.current.get(index) || 0) + 1
              );
              setRevision((value) => value + 1);
            }
          }
          progress(index + 1, current.done ? current.count : 0);
        }
        progress(current.count, current.count);
      },
      async download(mode, format) {
        const current = active.current;
        if (!current) return;
        const encoder = new TextEncoder();
        const name = file.name.replace(/\.[^.]+$/, "");
        const extension = format === "html" ? "html" : markdown ? "md" : "txt";
        const kind =
          extension === "html"
            ? "text/html"
            : extension === "md"
              ? "text/markdown"
              : "text/plain";
        return writeFileDownload(
          `${name}-${mode}.${extension}`,
          kind + ";charset=utf-8",
          async (writable) => {
            async function* chunks() {
              const marker = "<!-- FILE_TRANSLATION_BODY -->";
              const wrapper =
                extension === "html"
                  ? generateStandaloneHtml(marker, name).split(marker)
                  : [];
              await current.indexed;
              const check = () => {
                if (active.current !== current)
                  throw new DOMException("已取消", "AbortError");
                if (current.error) throw current.error;
              };
              check();
              if (wrapper.length) yield encoder.encode(wrapper[0]);
              const max = current.count;
              const getSource = async (index) => {
                check();
                const section = await current.store.get(`source:${index}`);
                if (!section) throw new Error("找不到已读取的文本段落");
                return section;
              };
              const getResult = (index) =>
                current.store.get(`translation:${settingsKey}:${index}`);
              async function* table(start, end, translated) {
                for (let index = start; index < end; index++) {
                  const source = await getSource(index);
                  const result = translated ? await getResult(index) : null;
                  const text = result?.target ?? source.text;
                  check();
                  if (extension !== "html") {
                    yield encoder.encode(text);
                    continue;
                  }
                  const fragment = document.createElement("template");
                  fragment.innerHTML = markdownHtml(
                    (source.tableHead || "") + text
                  );
                  const node = fragment.content.querySelector("table");
                  if (!node) throw new Error("无法导出 Markdown 表格分片");
                  if (index === start)
                    yield encoder.encode(
                      "<table>" + (node.tHead?.outerHTML || "") + "<tbody>"
                    );
                  yield encoder.encode(node.tBodies[0]?.innerHTML || "");
                }
                if (extension === "html")
                  yield encoder.encode("</tbody></table>");
              }
              for (let index = 0; index < max; index++) {
                const source = await getSource(index);
                if (source.tableStart) {
                  let end = index + 1;
                  while (end < max && (await getSource(end)).tableHead) end++;
                  if (mode !== "target") yield* table(index, end, false);
                  if (mode !== "source") {
                    if (mode === "bilingual" && extension !== "html")
                      yield encoder.encode("\n\n");
                    yield* table(index, end, true);
                  }
                  index = end - 1;
                  continue;
                }
                const result =
                  mode === "source" ? null : await getResult(index);
                check();
                const text =
                  (mode === "bilingual" ? result?.bilingual : result?.target) ??
                  source.text;
                yield encoder.encode(
                  extension === "html"
                    ? source.raw
                      ? "<pre>" + escapeHtmlText(text) + "</pre>"
                      : markdownHtml(
                          (source.tableHead && mode !== "bilingual"
                            ? source.tableHead
                            : "") + text
                        )
                    : text
                );
              }
              check();
              if (wrapper.length) yield encoder.encode(wrapper[1]);
            }
            await writeFileChunks(writable, chunks());
          },
          { large: file.size >= 16 * 1024 ** 2, signal: current.signal }
        );
      },
    }),
    [file, markdown, scene, setting, settingsKey]
  );

  return (
    <Box
      sx={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column" }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={viewMode}
        onChange={(_, value) => value && onViewMode(value)}
        sx={{ alignSelf: "flex-start", mb: 1 }}
      >
        <ToggleButton value="source">
          {i18n("epub_view_source", "原文")}
        </ToggleButton>
        <ToggleButton value="target">
          {i18n("epub_view_target", "译文")}
        </ToggleButton>
        <ToggleButton value="bilingual">
          {i18n("epub_view_bilingual", "双语")}
        </ToggleButton>
      </ToggleButtonGroup>
      <div ref={scroll} style={{ minHeight: 0, flex: 1, overflow: "auto" }}>
        <div ref={body} style={{ overflowAnchor: "none" }}>
          <div aria-hidden="true" style={{ height: windowed.before }} />
          {session &&
            Array.from(
              { length: windowed.end - windowed.start },
              (_, offset) => {
                const index = windowed.start + offset;
                return (
                  <TextSection
                    key={index}
                    session={session}
                    index={index}
                    settingsKey={settingsKey}
                    revision={revisions.current.get(index)}
                    markdown={markdown}
                    viewMode={viewMode}
                    measure={windowed.measure}
                  />
                );
              }
            )}
          <div aria-hidden="true" style={{ height: windowed.after }} />
        </div>
      </div>
    </Box>
  );
});

function markdownHtml(text) {
  return DOMPurify.sanitize(
    renderMarkdownBlocksToHtml(splitMarkdownBlocks(text), { mode: "source" })
  );
}

export default LargeTextWorkspace;
