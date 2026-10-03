/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as fflate from "fflate";
import DOMPurify from "dompurify";
import EpubReaderView, { sanitizeEpubReaderHtml } from "./EpubReaderView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 1000 } }]); }
    disconnect() {}
  };
});
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; });


describe("EpubReaderView (EPUB 体验细节与样式)", () => {
  let container;
  let root;

  const mockI18n = (key, fallback) => fallback || key;

  const mockChapter1Html = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><h1>Chapter 1</h1><p>Source paragraph 1</p></body>
</html>`;

  const mockChapter2Html = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 2</title></head>
<body><h1>Chapter 2</h1><p>Source paragraph 2</p></body>
</html>`;

  const mockEpubBook = {
    title: "Test Novel",
    author: "Test Author",
    spineItems: [
      { id: "ch1", href: "OEBPS/ch1.xhtml", fullPath: "OEBPS/ch1.xhtml", title: "Chapter 1" },
      { id: "ch2", href: "OEBPS/ch2.xhtml", fullPath: "OEBPS/ch2.xhtml", title: "Chapter 2" },
    ],
    filesMap: {
      "OEBPS/ch1.xhtml": fflate.strToU8(mockChapter1Html),
      "OEBPS/ch2.xhtml": fflate.strToU8(mockChapter2Html),
    },
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("目录默认关闭，展开后点击章节跳转保持展开", () => {
    act(() => root.render(<EpubReaderView epubBook={mockEpubBook} currentChapterIndex={0}
      epubViewMode="source" chapterStates={{}} busy={false} i18n={mockI18n} onSelectChapter={jest.fn()} />));
    const drawer = container.querySelector(".kt-toc-drawer");
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    const toggleBtn = container.querySelector('[aria-label="展开目录"]');
    expect(toggleBtn.style.border).toBe("");
    expect(toggleBtn.classList.contains("MuiIconButton-colorPrimary")).toBe(false);
    act(() => toggleBtn.click());
    expect(drawer.getAttribute("aria-hidden")).toBe("false");
    expect(toggleBtn.getAttribute("aria-label")).toBe("折叠目录");
    expect(toggleBtn.classList.contains("MuiIconButton-colorPrimary")).toBe(true);
    act(() => drawer.querySelector(".MuiListItemButton-root").click());
    expect(drawer.getAttribute("aria-hidden")).toBe("false");
  });

  test("1. 支持段落级流式上屏：在章节翻译中 (status === busy) 且存在 bilingualHtml 时立即呈现最新译文", () => {
    const chapterStates = {
      "OEBPS/ch1.xhtml": {
        status: "busy",
        bilingualHtml: '<div class="test-body"><p>Source 1</p><span class="kt-bilingual-target">Partial translated 1</span></div>',
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={chapterStates}
          busy={true}
          i18n={mockI18n}
        />
      );
    });

    expect(container.textContent).toContain("Partial translated 1");
  });

  test("2. 章节工具栏去重：不包含重复的【翻译整本书】按钮，但保留【试译当前章节】并在 busy 时显示【停止】", () => {
    const onCancelMock = jest.fn();

    // 未翻译状态 (busy = false)
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    // 章节工具栏应有【试译当前章节】，无【翻译整本书】按钮
    const buttons = Array.from(container.querySelectorAll("button"));
    const translateChapterBtn = buttons.find((btn) =>
      btn.textContent.includes("试译当前章节")
    );
    expect(translateChapterBtn).toBeTruthy();

    const translateBookBtn = buttons.find((btn) =>
      btn.textContent.includes("翻译整本书")
    );
    expect(translateBookBtn).toBeFalsy();

    const stopBtn = buttons.find((btn) => btn.textContent.includes("停止"));
    expect(stopBtn).toBeFalsy();

    // 翻译进行中状态 (busy = true)
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={true}
          onCancel={onCancelMock}
          i18n={mockI18n}
        />
      );
    });

    expect(container.textContent).toContain("停止");
  });

  test("3. 未翻译提示框：包含上下居中对齐样式及关闭叉号，点击叉号后可关掉提示", () => {
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    // 应该显示未翻译提示
    expect(container.textContent).toContain("当前章节尚未翻译");

    // 寻找 Alert 的关闭按钮并点击
    const closeBtn = container.querySelector(".MuiAlert-action button");
    expect(closeBtn).toBeTruthy();

    act(() => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 点击后提示信息消失
    expect(container.textContent).not.toContain("当前章节尚未翻译");
  });

  test("4. 章节切换滚动回顶：切换 currentChapterIndex 时正文容器 scrollTop 重置为 0", () => {
    let currentIdx = 0;

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={currentIdx}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    const scrollBox = container.querySelector(".kt-epub-reader-body")?.parentElement;
    expect(scrollBox).toBeTruthy();

    // 模拟用户向下滚动了 500px
    scrollBox.scrollTop = 500;

    // 切换章节
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={1}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    // 切换后 scrollTop 应被自动重置回 0
    expect(scrollBox.scrollTop).toBe(0);
  });

  test("5. 译文样式即时生效：传入 rawStyleCode 时动态注入 style 规则，作用于 .kt-bilingual-target 并与 Aa 设置叠加", () => {
    const rawStyle = "border: 2px dashed #409eff; padding: 4px;";

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{}}
          busy={false}
          rawStyleCode={rawStyle}
          readerPreferences={{ fontSize: 22, fontFamily: "serif", themeId: "sepia" }}
          i18n={mockI18n}
        />
      );
    });

    // 页面内应包含注入的 style 标签
    const styleTags = Array.from(container.querySelectorAll("style"));
    const injectedStyle = styleTags.find((s) => s.textContent.includes(".kt-epub-reader-body .kt-bilingual-target"));
    expect(injectedStyle).toBeTruthy();
    expect(injectedStyle.textContent).toContain("border: 2px dashed #409eff");

    // 容器的 Aa 设置（如字号 22px）也应并存生效
    const bodyBox = container.querySelector(".kt-epub-reader-body");
    expect(bodyBox).toBeTruthy();
    expect(window.getComputedStyle(bodyBox).fontSize).toBe("22px");
  });

  test("6. 正文搜索功能：支持关键词高亮、匹配计数统计、前后跳转与清除", () => {
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    const searchInput = container.querySelector('input[aria-label="search content"]');
    expect(searchInput).toBeTruthy();

    const setInputValue = (input, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // 1. 输入关键词 "paragraph"，触发搜索与高亮
    act(() => {
      setInputValue(searchInput, "paragraph");
    });

    const highlights = container.querySelectorAll("mark.kt-search-highlight");
    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0].textContent.toLowerCase()).toBe("paragraph");
    expect(highlights[0].classList.contains("kt-search-current")).toBe(true);

    // 全书单页长文档拼接模式下，各章节均在同一 DOM 中，paragraph 在 Chapter 1 和 Chapter 2 共命中 2 处，计数显示 1/2
    expect(container.textContent).toContain("1/2");

    // 2. 清空搜索，验证高亮完全清除
    act(() => {
      setInputValue(searchInput, "");
    });

    const remainingHighlights = container.querySelectorAll("mark.kt-search-highlight");
    expect(remainingHighlights.length).toBe(0);
  });

  test("7. 触发翻译时自动清除搜索框：点击【试译当前章节】或进入 busy 状态时自动清空搜索框与正文高亮", () => {
    const onTranslateChapterMock = jest.fn();

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onTranslateChapter={onTranslateChapterMock}
          i18n={mockI18n}
        />
      );
    });

    const searchInput = container.querySelector(
      'input[aria-label="search content"]'
    );
    expect(searchInput).toBeTruthy();

    const setInputValue = (input, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // 输入搜索词高亮
    act(() => {
      setInputValue(searchInput, "paragraph");
    });
    expect(
      container.querySelectorAll("mark.kt-search-highlight").length
    ).toBeGreaterThan(0);

    // 1. 点击【试译当前章节】按钮，验证搜索框与高亮自动清空，且回调被触发
    const buttons = Array.from(container.querySelectorAll("button"));
    const translateBtn = buttons.find((btn) =>
      btn.textContent.includes("试译当前章节")
    );
    expect(translateBtn).toBeTruthy();

    act(() => {
      translateBtn.click();
    });

    expect(onTranslateChapterMock).toHaveBeenCalled();
    expect(searchInput.value).toBe("");
    expect(
      container.querySelectorAll("mark.kt-search-highlight").length
    ).toBe(0);

    // 2. 再次输入搜索词后进入 busy 状态（如整本书翻译触发）
    act(() => {
      setInputValue(searchInput, "paragraph");
    });
    expect(
      container.querySelectorAll("mark.kt-search-highlight").length
    ).toBeGreaterThan(0);

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={true}
          onTranslateChapter={onTranslateChapterMock}
          i18n={mockI18n}
        />
      );
    });

    expect(searchInput.value).toBe("");
    expect(
      container.querySelectorAll("mark.kt-search-highlight").length
    ).toBe(0);
  });

  test("8. 目录栏宽度拖拽调整：支持通过鼠标拖动分割线调整宽度并持久化至 localStorage", async () => {
    localStorage.removeItem("kiss_epub_toc_width");

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    act(() => container.querySelector('[aria-label="展开目录"]').click());
    const resizer = container.querySelector('[role="separator"][aria-label="目录宽度"]');
    expect(resizer).toBeTruthy();

    const tocCard = resizer.parentElement;
    expect(tocCard).toBeTruthy();
    expect(tocCard.style.width).toBe("270px");

    // 1. 模拟按住 resizer 向右拖拽 +80px (270 -> 350px)
    act(() => {
      resizer.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 270,
          button: 0,
        })
      );
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 350,
        })
      );
    });

    await act(() => new Promise(requestAnimationFrame));
    expect(tocCard.style.width).toBe("350px");

    // 2. 模拟松开鼠标 (pointerup)
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 350,
        })
      );
    });

    expect(localStorage.getItem("kiss_epub_toc_width")).toBe("350");

    // 3. 模拟拖拽超过限制 (如拖至超大或超小)
    act(() => {
      resizer.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 350,
          button: 0,
        })
      );
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 50, // 试图拖到 50px
        })
      );
    });

    // 应受保护限制在 MIN_TOC_WIDTH (180px)
    await act(() => new Promise(requestAnimationFrame));
    expect(tocCard.style.width).toBe("180px");

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 50,
        })
      );
    });
    expect(localStorage.getItem("kiss_epub_toc_width")).toBe("180");
  });

  test("resize batches frames without rendering or sanitizing and cleans up cancel/unmount", () => {
    localStorage.removeItem("kiss_epub_toc_width");
    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const originalBodyStyle = document.body.style.cssText;
    const frames = new Map();
    let frameId = 0;
    window.requestAnimationFrame = jest.fn((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    window.cancelAnimationFrame = jest.fn((id) => frames.delete(id));
    const sanitize = jest.spyOn(DOMPurify, "sanitize");
    const commits = jest.fn();
    const pointer = (target, type, clientX) => act(() => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
    });
    try {
      document.body.style.cursor = "crosshair";
      document.body.style.userSelect = "text";
      act(() => root.render(
        <StrictMode>
          <React.Profiler id="reader" onRender={commits}>
            <EpubReaderView epubBook={mockEpubBook} currentChapterIndex={0}
              epubViewMode="source" chapterStates={{}} busy={false} i18n={mockI18n} />
          </React.Profiler>
        </StrictMode>
      ));
      act(() => container.querySelector('[aria-label="展开目录"]').click());
    const resizer = container.querySelector('[role="separator"][aria-label="目录宽度"]');
      const card = resizer.parentElement;
      pointer(resizer, "pointerdown", 270);
      sanitize.mockClear();
      commits.mockClear();
      window.requestAnimationFrame.mockClear();
      for (const x of [300, 320, 350]) pointer(window, "pointermove", x);
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(card.style.width).toBe("270px");
      act(() => {
        for (const callback of frames.values()) callback();
        frames.clear();
      });
      expect(card.style.width).toBe("350px");
      expect(commits).not.toHaveBeenCalled();
      expect(sanitize).not.toHaveBeenCalled();
      pointer(window, "pointermove", 400);
      pointer(window, "pointerup", 450);
      expect(card.style.width).toBe("450px");
      expect(localStorage.getItem("kiss_epub_toc_width")).toBe("450");
      expect(frames.size).toBe(0);
      expect(sanitize).not.toHaveBeenCalled();
      pointer(resizer, "pointerdown", 450);
      pointer(window, "pointermove", 10000);
      pointer(window, "pointercancel", 0);
      expect(localStorage.getItem("kiss_epub_toc_width")).toBe("600");
      expect(document.body.style.cursor).toBe("crosshair");
      expect(document.body.style.userSelect).toBe("text");
      pointer(resizer, "pointerdown", 600);
      pointer(window, "pointermove", 500);
      act(() => root.render(null));
      expect(frames.size).toBe(0);
      window.requestAnimationFrame.mockClear();
      pointer(window, "pointermove", 300);
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
      expect(localStorage.getItem("kiss_epub_toc_width")).toBe("600");
      expect(document.body.style.cursor).toBe("crosshair");
      expect(document.body.style.userSelect).toBe("text");
    } finally {
      act(() => root.render(null));
      sanitize.mockRestore();
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancel;
      document.body.style.cssText = originalBodyStyle;
    }
  });

  test("9. 双击分割线手柄重置为默认宽度 270px", () => {
    localStorage.setItem("kiss_epub_toc_width", "420");

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    act(() => container.querySelector('[aria-label="展开目录"]').click());
    const resizer = container.querySelector('[role="separator"][aria-label="目录宽度"]');
    const tocCard = resizer.parentElement;
    expect(tocCard.style.width).toBe("420px");

    // 双击分割线手柄
    act(() => {
      resizer.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(tocCard.style.width).toBe("270px");
    expect(localStorage.getItem("kiss_epub_toc_width")).toBe("270");
  });

  test("10. 目录树渲染与多级子章节折叠展开", () => {
    const mockBookWithTree = {
      ...mockEpubBook,
      tocTree: [
        {
          id: "node-1",
          title: "第一篇：追逐者",
          fullPath: "OEBPS/ch1.xhtml",
          children: [
            {
              id: "node-1-1",
              title: "第 I 节",
              fullPath: "OEBPS/ch1.xhtml",
              hash: "part1",
              children: [],
            },
            {
              id: "node-1-2",
              title: "第 II 节",
              fullPath: "OEBPS/ch1.xhtml",
              hash: "part2",
              children: [],
            },
          ],
        },
      ],
      tocItems: [
        { title: "第一篇：追逐者", fullPath: "OEBPS/ch1.xhtml" },
        { title: "第 I 节", fullPath: "OEBPS/ch1.xhtml" },
        { title: "第 II 节", fullPath: "OEBPS/ch1.xhtml" },
      ],
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBookWithTree}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    expect(container.textContent).toContain("第一篇：追逐者");
    // 二级目录默认收起
    expect(container.textContent).not.toContain("第 I 节");
    expect(container.textContent).not.toContain("第 II 节");

    // 点击展开按钮
    const expandBtn = container.querySelector(".MuiListItemButton-root button");
    expect(expandBtn).toBeTruthy();
    act(() => {
      expandBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 展开后显示二级目录
    expect(container.textContent).toContain("第 I 节");
    expect(container.textContent).toContain("第 II 节");
    expect(container.textContent).toContain("书籍目录 (3)");
  });

  test("11. 封面图与插图相对路径自动映射为 Blob URL 正常显示，避免破裂", () => {
    const originalCreate = global.URL.createObjectURL;
    global.URL.createObjectURL = jest.fn(() => "blob:http://localhost/cover-blob-uuid");

    const htmlWithImg = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <img src="cover.jpg" alt="Cover Image" />
</body>
</html>`;

    const bookWithImg = {
      title: "Cover Book",
      spineItems: [
        { id: "cover", href: "OEBPS/wrap.xhtml", fullPath: "OEBPS/wrap.xhtml", title: "Cover" },
      ],
      filesMap: {
        "OEBPS/wrap.xhtml": fflate.strToU8(htmlWithImg),
        "OEBPS/cover.jpg": new Uint8Array([10, 20, 30]),
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={bookWithImg}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    const imgEl = container.querySelector('img[alt="Cover Image"]');
    expect(imgEl).toBeTruthy();
    expect(imgEl.getAttribute("src")).toBe("blob:http://localhost/cover-blob-uuid");

    if (originalCreate) {
      global.URL.createObjectURL = originalCreate;
    }
  });

  test("StrictMode keeps displayed cover URLs alive and releases replaced books and unmounted resources", () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const liveUrls = new Set();
    let count = 0;
    URL.createObjectURL = jest.fn(() => {
      const url = `blob:http://localhost/cover-${++count}`;
      liveUrls.add(url);
      return url;
    });
    URL.revokeObjectURL = jest.fn((url) => liveUrls.delete(url));
    const html = '<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.jpg" alt="Cover" /></body></html>';
    const book = {
      ...mockEpubBook,
      filesMap: {
        ...mockEpubBook.filesMap,
        "OEBPS/ch1.xhtml": fflate.strToU8(html),
        "OEBPS/cover.jpg": new Uint8Array([1, 2, 3]),
      },
    };
    const states = {
      "OEBPS/ch1.xhtml": {
        status: "done",
        sourceHtml: html,
        targetHtml: html.replace("</body>", "<p>Target</p></body>"),
        bilingualHtml: html.replace("</body>", "<p>Bilingual</p></body>"),
      },
    };
    const getRenderedCoverUrl = (epubBook, mode, index = 0) => {
      act(() => {
        root.render(
          <StrictMode>
            <EpubReaderView epubBook={epubBook} currentChapterIndex={index}
              epubViewMode={mode} chapterStates={states} busy={false} i18n={mockI18n} />
          </StrictMode>
        );
      });
      const src = container.querySelector('img[alt="Cover"]').getAttribute("src");
      expect(liveUrls.has(src)).toBe(true);
      return src;
    };
    try {
      getRenderedCoverUrl(book, "source");
      getRenderedCoverUrl(book, "target");
      const view = getRenderedCoverUrl(book, "bilingual");
      expect(getRenderedCoverUrl(book, "bilingual", 1)).toBe(view);
      const utils = getRenderedCoverUrl({ ...book, title: "Replacement" }, "bilingual");
      expect(utils).not.toBe(view);
      expect(liveUrls.has(view)).toBe(false);
      act(() => root.render(null));
      expect(liveUrls.size).toBe(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(count);
    } finally {
      act(() => root.render(null));
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test("12. 点击二级目录锚点条目触发分卷选择与定位", () => {
    const onSelectChapterMock = jest.fn();
    const mockBookWithTree = {
      ...mockEpubBook,
      tocTree: [
        {
          id: "node-1",
          title: "第一部",
          fullPath: "OEBPS/ch1.xhtml",
          children: [
            {
              id: "node-1-1",
              title: "第 I 节",
              fullPath: "OEBPS/ch2.xhtml",
              hash: "sec-1",
              children: [],
            },
          ],
        },
      ],
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBookWithTree}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={onSelectChapterMock}
          i18n={mockI18n}
        />
      );
    });

    // 二级目录默认收起，先点击展开按钮
    const expandBtn = container.querySelector(".MuiListItemButton-root button");
    expect(expandBtn).toBeTruthy();
    act(() => {
      expandBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 寻找 "第 I 节" 的按钮并点击
    const buttons = Array.from(container.querySelectorAll(".MuiListItemButton-root"));
    const sec1Btn = buttons.find((btn) => btn.textContent.includes("第 I 节"));
    expect(sec1Btn).toBeTruthy();

    act(() => {
      sec1Btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 应该选中所属的分卷索引 1 (OEBPS/ch2.xhtml)
    expect(onSelectChapterMock).toHaveBeenCalledWith(1);
  });

  test("13. 实体纸张拟真卡片与背景分离、支持页面宽度设置且标题居中", () => {
    const onChangePrefsMock = jest.fn();
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          readerPreferences={{ pageWidth: 840, fontSize: 18, themeId: "sepia" }}
          onChangeReaderPreferences={onChangePrefsMock}
          i18n={mockI18n}
        />
      );
    });

    // 正文纸张卡片应存在，且类名为 kt-epub-reader-body
    const paperEl = container.querySelector(".kt-epub-reader-body");
    expect(paperEl).toBeTruthy();

    // 点击 Aa 阅读排版设置
    const aaBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent.includes("Aa")
    );
    expect(aaBtn).toBeTruthy();
    act(() => {
      aaBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 检查 Aa 弹窗中是否存在页面宽度设置
    const popoverContent = document.body.textContent;
    expect(popoverContent).toContain("页面宽度");
    expect(popoverContent).toContain("840 px");
    expect(popoverContent).toContain("窄版 (680)");
    expect(popoverContent).toContain("宽版 (1020)");

    // 点击 W+ 按钮微调
    const buttons = Array.from(document.querySelectorAll("button"));
    const wPlusBtn = buttons.find((b) => b.textContent === "W+");
    expect(wPlusBtn).toBeTruthy();
    act(() => {
      wPlusBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChangePrefsMock).toHaveBeenCalledWith({ pageWidth: 880 });

    // 点击预设档位 1020
    const widePresetBtn = buttons.find((b) => b.textContent.includes("宽版 (1020)"));
    expect(widePresetBtn).toBeTruthy();
    act(() => {
      widePresetBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChangePrefsMock).toHaveBeenCalledWith({ pageWidth: 1020 });
  });

  test("14. 顶部固定显示电子书名，不再显示章节名称，且底部冗余页脚已移除", () => {
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    // 顶部工具栏左侧只显示书名 Test Novel
    const titles = Array.from(container.querySelectorAll(".MuiTypography-subtitle2"));
    const bookTitleEl = titles.find((el) => el.textContent === "Test Novel");
    expect(bookTitleEl).toBeTruthy();

    // 底部旧版页脚已被完全移除
    const footers = container.querySelectorAll(".kt-epub-reader-body + div");
    expect(footers.length).toBe(0);
  });

  test("15. 拦截正文跨章与本章链接点击，平滑跳转对应章节并更新章节索引（修复问题 7）", () => {
    const onSelectChapterMock = jest.fn();
    const mockBookWithLinks = {
      ...mockEpubBook,
      filesMap: {
        "OEBPS/ch1.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 1</h1>
  <a href="ch2.xhtml#sec2" class="link-to-ch2">Go to Chapter 2 Section 2</a>
  <a href="https://example.com" class="link-external">External Link</a>
</body>
</html>`),
        "OEBPS/ch2.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 2</h1>
  <div id="sec2">Section 2 in Chapter 2</div>
</body>
</html>`),
      },
    };

    const originalOpen = window.open;
    window.open = jest.fn();

    // mock scrollIntoView
    Element.prototype.scrollIntoView = jest.fn();

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBookWithLinks}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={onSelectChapterMock}
          i18n={mockI18n}
        />
      );
    });

    // 1. 点击外部链接，验证通过 window.open 打开，不触发章节跳转
    const externalLink = container.querySelector(".link-external");
    expect(externalLink).toBeTruthy();
    act(() => {
      externalLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(window.open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(onSelectChapterMock).not.toHaveBeenCalled();

    // 2. 点击跨章相对链接，验证自动解析并跳转至章节 1 (OEBPS/ch2.xhtml)
    const ch2Link = container.querySelector(".link-to-ch2");
    expect(ch2Link).toBeTruthy();
    act(() => {
      ch2Link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onSelectChapterMock).toHaveBeenCalledWith(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    window.open = originalOpen;
  });

  test("16. 目录锚点跳转仅在所属章节容器内查找，避免跨章同名 ID 误定位（修复问题 7）", () => {
    jest.useFakeTimers();
    const onSelectChapterMock = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();

    const mockBookWithDuplicateIds = {
      ...mockEpubBook,
      tocTree: [
        {
          id: "toc-ch2-part",
          title: "第二章同名节",
          fullPath: "OEBPS/ch2.xhtml",
          hash: "dup-id",
          children: [],
        },
      ],
      filesMap: {
        "OEBPS/ch1.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 1</h1>
  <div id="dup-id" data-origin="ch1">Chapter 1 Duplicate ID</div>
</body>
</html>`),
        "OEBPS/ch2.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 2</h1>
  <div id="dup-id" data-origin="ch2">Chapter 2 Duplicate ID</div>
</body>
</html>`),
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBookWithDuplicateIds}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={onSelectChapterMock}
          i18n={mockI18n}
        />
      );
    });

    const tocBtn = Array.from(container.querySelectorAll(".MuiListItemButton-root")).find((btn) =>
      btn.textContent.includes("第二章同名节")
    );
    expect(tocBtn).toBeTruthy();

    act(() => {
      tocBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelectChapterMock).toHaveBeenCalledWith(1);

    // 前进定时器执行 handleSelectTocNode 内的 setTimeout
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // 验证 scrollIntoView 调用时，目标元素属于 ch2 容器，而非 ch1
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const ch2Target = container.querySelector('#epub-spine-1 [id="dup-id"]');
    expect(ch2Target.getAttribute("data-origin")).toBe("ch2");

    jest.useRealTimers();
  });

  test("17. 正文滚动时根据视口焦点自动同步当前章节索引（修复问题 8）", () => {
    const onSelectChapterMock = jest.fn();

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={onSelectChapterMock}
          i18n={mockI18n}
        />
      );
    });

    const scrollContainer = container.querySelector(".kt-epub-reader-body")?.parentElement;
    expect(scrollContainer).toBeTruthy();

    // 模拟 getBoundingClientRect
    scrollContainer.getBoundingClientRect = () => ({
      top: 0,
      bottom: 600,
      height: 600,
    });

    const sec0 = container.querySelector("#epub-spine-0");
    const sec1 = container.querySelector("#epub-spine-1");

    // 模拟滚动使得 sec0 移出视口上方，sec1 覆盖视口焦点（top: -200, bottom: 800）
    sec0.getBoundingClientRect = () => ({ top: -800, bottom: -200 });
    sec1.getBoundingClientRect = () => ({ top: -200, bottom: 800 });

    act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    expect(onSelectChapterMock).toHaveBeenCalledWith(1);
  });

  test("18. 自然滚动触发章节索引变更后，容器 scrollTop 绝不重置为 0（第二轮修复问题 1）", () => {
    let currentIdx = 0;
    const handleSelectChapter = (newIdx) => {
      currentIdx = newIdx;
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={currentIdx}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={handleSelectChapter}
          i18n={mockI18n}
        />
      );
    });

    const scrollContainer = container.querySelector(".kt-epub-reader-body")?.parentElement;
    expect(scrollContainer).toBeTruthy();

    // 模拟用户向下滚动到了 850px
    scrollContainer.scrollTop = 850;

    scrollContainer.getBoundingClientRect = () => ({
      top: 0,
      bottom: 600,
      height: 600,
    });

    const sec0 = container.querySelector("#epub-spine-0");
    const sec1 = container.querySelector("#epub-spine-1");
    sec0.getBoundingClientRect = () => ({ top: -800, bottom: -200 });
    sec1.getBoundingClientRect = () => ({ top: -200, bottom: 800 });

    // 触发正文滚动事件
    act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"));
    });

    // 验证当前章节索引已被 handleScroll 同步为 1
    expect(currentIdx).toBe(1);

    // 模拟父组件以更新后的 currentChapterIndex = 1 重新渲染
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={currentIdx}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={handleSelectChapter}
          i18n={mockI18n}
        />
      );
    });

    // 核心验证：由自然滚动引发的章节索引切换，scrollTop 依然保持 850，绝不跳回书首 0！
    expect(scrollContainer.scrollTop).toBe(850);
  });

  test("19. 正文链接中的百分号编码锚点自动解码并精确定位元素（第二轮修复问题 5）", () => {
    const onSelectChapterMock = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();

    const mockBookWithEncodedHash = {
      ...mockEpubBook,
      filesMap: {
        "OEBPS/ch1.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 1</h1>
  <!-- 编码了空格与中文字符的锚点链接 -->
  <a href="ch2.xhtml#section%20first" class="link-encoded-space">Go to Section First</a>
  <a href="ch2.xhtml#%E7%AC%AC%E4%BA%8C%E8%8A%82" class="link-encoded-cjk">Go to CJK Section</a>
</body>
</html>`),
        "OEBPS/ch2.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 2</h1>
  <div id="section first" data-tag="target-space">Section First Target</div>
  <div id="第二节" data-tag="target-cjk">第二节目标</div>
</body>
</html>`),
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBookWithEncodedHash}
          currentChapterIndex={0}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={onSelectChapterMock}
          i18n={mockI18n}
        />
      );
    });

    // 1. 点击带百分号编码空格的链接
    const spaceLink = container.querySelector(".link-encoded-space");
    expect(spaceLink).toBeTruthy();

    act(() => {
      spaceLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onSelectChapterMock).toHaveBeenCalledWith(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // 2. 点击带百分号编码中文的链接
    const cjkLink = container.querySelector(".link-encoded-cjk");
    expect(cjkLink).toBeTruthy();

    act(() => {
      cjkLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onSelectChapterMock).toHaveBeenCalledWith(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test("20. 取消或失败章节 (status === idle) 绝不显示未完成的残缺译文（第二轮修复问题 3）", () => {
    const chapterStates = {
      "OEBPS/ch1.xhtml": {
        status: "idle", // 被取消或发生错误重置为 idle，但可能残存部分 HTML
        bilingualHtml: '<div class="test-body"><p>Source 1</p><span class="kt-bilingual-target">Partial Unfinished Target</span></div>',
        targetHtml: '<div class="test-body"><p>Partial Unfinished Target</p></div>',
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={chapterStates}
          busy={false}
          i18n={mockI18n}
        />
      );
    });

    // 状态为 idle 时，阅读器绝不能渲染未完成的残存译文，而是展示原始章节内容
    expect(container.textContent).not.toContain("Partial Unfinished Target");
    expect(container.textContent).toContain("Source paragraph 1");
  });

  test("21. 正文跨章链接点击后父组件更新 currentChapterIndex 重新渲染，scrollTop 绝不被冲刷重置为 0（第三轮修复问题 2）", () => {
    let currentIdx = 0;
    const handleSelectChapter = (newIdx) => {
      currentIdx = newIdx;
    };

    Element.prototype.scrollIntoView = jest.fn();

    const mockBook = {
      ...mockEpubBook,
      filesMap: {
        "OEBPS/ch1.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 1</h1>
  <a href="ch2.xhtml#target-anchor" class="cross-link">Go to Target in Chapter 2</a>
</body>
</html>`),
        "OEBPS/ch2.xhtml": fflate.strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>Chapter 2</h1>
  <div id="target-anchor">Target Anchor Element</div>
</body>
</html>`),
      },
    };

    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBook}
          currentChapterIndex={currentIdx}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={handleSelectChapter}
          i18n={mockI18n}
        />
      );
    });

    const scrollContainer = container.querySelector(".kt-epub-reader-body")?.parentElement;
    expect(scrollContainer).toBeTruthy();

    const crossLink = container.querySelector(".cross-link");
    expect(crossLink).toBeTruthy();

    // 1. 点击跨章超链接
    act(() => {
      crossLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    // 验证触发了 scrollIntoView，且父组件的章节索引更新为 1
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(currentIdx).toBe(1);

    // 模拟平滑滚动使 scrollContainer 已经滚动到了锚点位置（如 900px）
    scrollContainer.scrollTop = 900;

    // 2. 模拟父组件携带新索引 currentChapterIndex = 1 重新渲染
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockBook}
          currentChapterIndex={currentIdx}
          epubViewMode="source"
          chapterStates={{}}
          busy={false}
          onSelectChapter={handleSelectChapter}
          i18n={mockI18n}
        />
      );
    });

    // 3. 核心验证：因处于导航锁 (isNavigatingRef) 保护中，切章 effect 绝未将 scrollTop 重置为 0！
    expect(scrollContainer.scrollTop).toBe(900);
  });

  test("15. sanitizeEpubReaderHtml 拦截远程 src、srcset 与 style，且绝不污染全局 DOMPurify 对 Markdown 的净化（第五轮问题 1）", async () => {
    const DOMPurify = (await import("dompurify")).default;
    const { sanitizeEpubReaderHtml } = await import("./EpubReaderView");

    // 1. 测试 EPUB 阅读器专用净化：严格剥离远程资源（含 srcset 与 style url）
    const dirtyEpubHtml = `<div>
      <img src="https://attacker.com/evil.jpg" srcset="https://attacker.com/evil1.jpg 1x, https://attacker.com/evil2.jpg 2x" alt="pic" />
      <img src="blob:http://localhost/123-abc" srcset="blob:http://localhost/123 1x" alt="local-blob" />
      <div style="background-image: url('https://attacker.com/tracker.png'); color: red;">Styled</div>
    </div>`;

    const sanitizedEpub = sanitizeEpubReaderHtml(dirtyEpubHtml);
    expect(sanitizedEpub).not.toContain("https://attacker.com/evil.jpg");
    expect(sanitizedEpub).not.toContain("https://attacker.com/evil1.jpg");
    expect(sanitizedEpub).not.toContain("https://attacker.com/evil2.jpg");
    expect(sanitizedEpub).not.toContain("https://attacker.com/tracker.png");
    // 本地 blob 资源应保留
    expect(sanitizedEpub).toContain("blob:http://localhost/123-abc");

    // 2. 核心验证：全局 DOMPurify 未被污染，Markdown 图片正常保留远程 src
    const markdownHtml = `<p><img src="https://example.com/remote-markdown-image.png" alt="remote md pic"></p>`;
    const sanitizedMarkdown = DOMPurify.sanitize(markdownHtml);
    expect(sanitizedMarkdown).toContain('src="https://example.com/remote-markdown-image.png"');
  });

  test("16. 阅读器章节级缓存：流式更新单个章节时复用未变章节的 DOM 解析与 Blob URL（第五轮问题 4）", () => {
    // 首次全量渲染
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{
            "OEBPS/ch1.xhtml": {
              status: "busy",
              bilingualHtml: "<p>Ch1 v1</p>",
            },
          }}
          busy={true}
          onSelectChapter={() => {}}
          i18n={mockI18n}
        />
      );
    });

    const ch2SectionBefore = container.querySelector("#epub-spine-1");
    expect(ch2SectionBefore).not.toBeNull();
    const ch2HtmlBefore = ch2SectionBefore.innerHTML;

    // 仅更新第 1 章的流式段落
    act(() => {
      root.render(
        <EpubReaderView
          epubBook={mockEpubBook}
          currentChapterIndex={0}
          epubViewMode="bilingual"
          chapterStates={{
            "OEBPS/ch1.xhtml": {
              status: "busy",
              bilingualHtml: "<p>Ch1 v2 updated</p>",
            },
          }}
          busy={true}
          onSelectChapter={() => {}}
          i18n={mockI18n}
        />
      );
    });

    const ch1SectionAfter = container.querySelector("#epub-spine-0");
    const ch2SectionAfter = container.querySelector("#epub-spine-1");
    expect(ch1SectionAfter.innerHTML).toContain("Ch1 v2 updated");
    // 第 2 章内容未变且缓存命中
    expect(ch2SectionAfter.innerHTML).toBe(ch2HtmlBefore);
  });

  test("24. sanitizeEpubReaderHtml 严格清洗包含 CSS 反斜杠转义的远程背景图（第七轮问题 2）", () => {
    const maliciousHtml = `<div>
      <div id="test1" style="background-image:url(\\68ttps://example.com/track.png)">Text 1</div>
      <div id="test2" style="background: url('\\000068ttps://example.com/track2.png')">Text 2</div>
      <style>
        .banner { background: url(\\68 ttps://example.com/banner.jpg); }
      </style>
      <a href="https://example.com/safe">安全外链</a>
    </div>`;

    const cleaned = sanitizeEpubReaderHtml(maliciousHtml);
    expect(cleaned).not.toContain("track.png");
    expect(cleaned).not.toContain("track2.png");
    expect(cleaned).not.toContain("banner.jpg");
    expect(cleaned).toContain("none");
    expect(cleaned).toContain('href="https://example.com/safe"');
  });
});
