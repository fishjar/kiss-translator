import * as fflate from "fflate";
import {
  translateEpubChapter,
  translateEpubBook,
  exportEpubFromChapterStates,
  getEpubFooterHtml,
  EPUB_FOOTER_HTML,
} from "../fileTranslate";
import { parseEpubBook } from "./epubParser";
import { apiTranslate } from "../../apis";

jest.mock("../../fileTranslation/client", () =>
  jest.requireActual("../fileTranslationService")
);
jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("webextension-polyfill", () => ({}));

describe("EPUB 翻译流水线单元测试", () => {
  const containerXml = `<?xml version="1.0"?>
  <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
  </container>`;

  const opfXml = `<?xml version="1.0" encoding="utf-8"?>
  <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Test Book</dc:title>
      <dc:language>en</dc:language>
    </metadata>
    <manifest>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
    </manifest>
    <spine>
      <itemref idref="ch1" />
    </spine>
  </package>`;

  const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head><title>Chapter 1</title></head>
    <body>
      <h1>Morning</h1>
      <p>The sun is rising.</p>
    </body>
  </html>`;

  const filesMap = {
    mimetype: fflate.strToU8("application/epub+zip"),
    "META-INF/container.xml": fflate.strToU8(containerXml),
    "OEBPS/content.opf": fflate.strToU8(opfXml),
    "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
  };

  const scene = {
    apiSlug: "primary",
    fromLang: "en",
    toLang: "zh-CN",
    textStyle: "style_underline",
  };

  const setting = {
    transApis: [
      {
        apiSlug: "primary",
        apiType: "Microsoft",
        apiName: "Primary",
        sourceType: "network",
        enabledCapabilities: ["translate"],
        isDisabled: false,
      },
    ],
    prompts: [],
    subtitleSetting: {},
  };

  beforeEach(() => {
    apiTranslate.mockReset();
    apiTranslate.mockImplementation(async ({ text }) => {
      if (text.includes("Morning")) return { trText: "早晨" };
      if (text.includes("The sun is rising."))
        return { trText: "太阳正在升起。" };
      return { trText: `译:${text}` };
    });
  });

  test("translateEpubChapter 单章试译与双语行内生成", async () => {
    const res = await translateEpubChapter(
      "OEBPS/ch1.xhtml",
      filesMap,
      scene,
      setting
    );

    expect(res.unitsCount).toBe(2);
    expect(res.sourceHtml).toContain("The sun is rising.");
    expect(res.targetHtml).toContain("太阳正在升起。");
    // 双语模式应包含行内 br 和 target span
    expect(res.bilingualHtml).toContain("The sun is rising.");
    expect(res.bilingualHtml).toContain('<br class="kt-bilingual-br"');
    expect(res.bilingualHtml).toContain("kt-bilingual-target");
    expect(res.bilingualHtml).toContain("太阳正在升起。");
  });

  test("translateEpubBook 全书流式翻译与合规重打包", async () => {
    const epubZip = fflate.zipSync(filesMap);
    const epubBook = await parseEpubBook(epubZip);

    const progressLogs = [];
    const bookResult = await translateEpubBook(
      epubBook,
      scene,
      setting,
      null,
      (currentChapter, totalChapters) => {
        progressLogs.push({ currentChapter, totalChapters });
      }
    );

    expect(bookResult.totalParagraphsCount).toBe(2);
    expect(progressLogs.length).toBeGreaterThan(0);
    expect(bookResult.bilingualBlob).toBeDefined();
    expect(bookResult.targetBlob).toBeDefined();

    // 校验生成的双语 EPUB 文件映射表
    expect(
      bookResult.bilingualFilesMap["OEBPS/styles/kiss-translator-epub.css"]
    ).toBeDefined();

    // 校验生成的纯译文 EPUB 文件映射表与 OPF 清单注册（修复问题 2 与问题 1）
    expect(
      bookResult.targetFilesMap["OEBPS/styles/kiss-translator-epub.css"]
    ).toBeDefined();
    const targetOpfStr = fflate.strFromU8(
      bookResult.targetFilesMap["OEBPS/content.opf"]
    );
    expect(targetOpfStr).toContain('href="styles/kiss-translator-epub.css"');
    expect(targetOpfStr).not.toContain('xmlns=""');

    // 检查章节中是否引入了样式表
    const chapterStr = fflate.strFromU8(
      bookResult.bilingualFilesMap["OEBPS/ch1.xhtml"]
    );
    expect(chapterStr).toContain("kiss-translator-epub.css");
    expect(chapterStr).toContain("太阳正在升起。");

    const targetChapterStr = fflate.strFromU8(
      bookResult.targetFilesMap["OEBPS/ch1.xhtml"]
    );
    expect(targetChapterStr).toContain("kiss-translator-epub.css");
    expect(targetChapterStr).toContain("太阳正在升起。");
  });

  test("translateEpubChapter 翻译失败时正常抛错且无未处理的 Promise 拒绝（修复问题 5）", async () => {
    apiTranslate.mockImplementationOnce(async () => {
      throw new Error("翻译网络异常");
    });

    let unhandledRejections = 0;
    const rejectionHandler = () => {
      unhandledRejections++;
    };
    process.on("unhandledRejection", rejectionHandler);

    try {
      await expect(
        translateEpubChapter("OEBPS/ch1.xhtml", filesMap, scene, setting)
      ).rejects.toThrow("翻译网络异常");

      // 稍等等待微任务完成，确保无悬挂拒绝
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandledRejections).toBe(0);
    } finally {
      process.off("unhandledRejection", rejectionHandler);
    }
  });

  test("exportEpubFromChapterStates: 0 章节翻译时导出 .custom.epub 并注入正文字体", async () => {
    const epubZip = fflate.zipSync(filesMap);
    const epubBook = await parseEpubBook(epubZip);

    // 未翻译任何章节 (chapterStates 为空)
    const { blob, uint8Array, filename, hasAnyTranslated } =
      exportEpubFromChapterStates(
        epubBook,
        {},
        scene,
        { fontFamily: "kaiti" },
        "bilingual"
      );

    expect(hasAnyTranslated).toBe(false);
    expect(filename).toBe("Test Book.custom.epub");
    expect(blob).toBeDefined();

    // 解包验证导出的 ZIP 文件内容
    const unpacked = fflate.unzipSync(uint8Array);

    // 1. 验证注入了楷体 CSS 与 footer 样式
    const cssContent = fflate.strFromU8(
      unpacked["OEBPS/styles/kiss-translator-epub.css"]
    );
    expect(cssContent).toContain("KaiTi");
    expect(cssContent).toContain(".kt-epub-footer");

    // 2. 验证 OPF 书名未被添加 [译]/[双语] 后缀，且严格保留原书语言 en 与无 xmlns=''（修复问题 4 与问题 1）
    const opfContent = fflate.strFromU8(unpacked["OEBPS/content.opf"]);
    expect(opfContent).not.toContain("[双语对照]");
    expect(opfContent).not.toContain("[译]");
    expect(opfContent).toContain("<dc:language>en</dc:language>");
    expect(opfContent).not.toContain('xmlns=""');

    // 3. 验证章节末尾包含框住的注明与主页链接（由 KISS Translator 制作）
    const ch1 = fflate.strFromU8(unpacked["OEBPS/ch1.xhtml"]);
    expect(ch1).toContain("kt-epub-footer");
    expect(ch1).toContain("https://github.com/fishjar/kiss-translator");
    expect(ch1).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 制作'
    );
  });

  test("exportEpubFromChapterStates: 部分章节翻译时导出 .bilingual.epub", async () => {
    const multiOpfXml = opfXml
      .replace(
        '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />',
        '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />\n      <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml" />'
      )
      .replace(
        '<itemref idref="ch1" />',
        '<itemref idref="ch1" />\n      <itemref idref="ch2" />'
      );
    const multiChapterFilesMap = {
      ...filesMap,
      "OEBPS/content.opf": fflate.strToU8(multiOpfXml),
      "OEBPS/ch2.xhtml": fflate.strToU8(
        `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter 2 raw text.</p></body></html>`
      ),
    };
    const epubZip = fflate.zipSync(multiChapterFilesMap);
    const epubBook = await parseEpubBook(epubZip);

    // 仅第 1 章有双语翻译结果，第 2 章未翻译
    const chapterStates = {
      "OEBPS/ch1.xhtml": {
        status: "done",
        bilingualXhtml: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>The sun is rising.<span class="kt-bilingual-target">太阳正在升起。</span></p></body></html>`,
      },
    };

    const { uint8Array, filename, hasAnyTranslated } =
      exportEpubFromChapterStates(
        epubBook,
        chapterStates,
        scene,
        { textStyleCode: "color: #2563eb;" },
        "bilingual"
      );

    expect(hasAnyTranslated).toBe(true);
    expect(filename).toBe("Test Book.bilingual.epub");

    const unpacked = fflate.unzipSync(uint8Array);

    // 第 1 章包含双语译文及底部注明
    const ch1 = fflate.strFromU8(unpacked["OEBPS/ch1.xhtml"]);
    expect(ch1).toContain("太阳正在升起。");
    expect(ch1).toContain("kt-epub-footer");
    expect(ch1).toContain("https://github.com/fishjar/kiss-translator");
    expect(ch1).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 制作'
    );

    // 第 2 章保持原文章节且同样包含底部注明
    const ch2 = fflate.strFromU8(unpacked["OEBPS/ch2.xhtml"]);
    expect(ch2).toContain("Chapter 2 raw text.");
    expect(ch2).toContain("kt-epub-footer");
    expect(ch2).toContain("https://github.com/fishjar/kiss-translator");
  });

  test("exportEpubFromChapterStates: 未完成的 busy 或 idle 草稿章节绝不导出为译文，且判定 hasAnyTranslated 为 false（修复问题 2）", async () => {
    const multiOpfXml = opfXml
      .replace(
        '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />',
        '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />\n      <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml" />'
      )
      .replace(
        '<itemref idref="ch1" />',
        '<itemref idref="ch1" />\n      <itemref idref="ch2" />'
      );
    const multiChapterFilesMap = {
      ...filesMap,
      "OEBPS/content.opf": fflate.strToU8(multiOpfXml),
      "OEBPS/ch2.xhtml": fflate.strToU8(
        `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter 2 raw text.</p></body></html>`
      ),
    };
    const epubZip = fflate.zipSync(multiChapterFilesMap);
    const epubBook = await parseEpubBook(epubZip);

    // 第 1 章状态为 busy（流式中间草稿），第 2 章状态为 idle（失败中断残留草稿）
    const unfinishedStates = {
      "OEBPS/ch1.xhtml": {
        status: "busy",
        bilingualXhtml: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Morning<span class="kt-bilingual-target">早晨</span></p></body></html>`,
      },
      "OEBPS/ch2.xhtml": {
        status: "idle",
        bilingualXhtml: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Half translated draft</p></body></html>`,
      },
    };

    const { uint8Array, filename, hasAnyTranslated } =
      exportEpubFromChapterStates(
        epubBook,
        unfinishedStates,
        scene,
        {},
        "bilingual"
      );

    // 绝不能判定为有翻译结果，文件名保持 custom.epub
    expect(hasAnyTranslated).toBe(false);
    expect(filename).toBe("Test Book.custom.epub");

    const unpacked = fflate.unzipSync(uint8Array);
    const ch1 = fflate.strFromU8(unpacked["OEBPS/ch1.xhtml"]);
    const ch2 = fflate.strFromU8(unpacked["OEBPS/ch2.xhtml"]);

    // 两章均严格保留原文章节，草稿绝不被写入
    expect(ch1).toContain("The sun is rising.");
    expect(ch1).not.toContain("早晨");
    expect(ch2).toContain("Chapter 2 raw text.");
    expect(ch2).not.toContain("Half translated draft");
  });

  test("多语言 footer 生成与导出测试", async () => {
    // 1. 默认与中文简体
    expect(EPUB_FOOTER_HTML).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 制作'
    );
    expect(getEpubFooterHtml("zh")).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 制作'
    );
    expect(getEpubFooterHtml("zh-CN")).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 制作'
    );

    // 2. 繁体中文
    expect(getEpubFooterHtml("zh-TW")).toContain(
      '由 <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 製作'
    );

    // 3. 英文
    expect(getEpubFooterHtml("en")).toContain(
      'Made by <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a>'
    );
    expect(getEpubFooterHtml("en-US")).toContain(
      'Made by <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a>'
    );

    // 4. 日文
    expect(getEpubFooterHtml("ja")).toContain(
      '<a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> で制作'
    );

    // 5. 韩文
    expect(getEpubFooterHtml("ko")).toContain(
      '<a href="https://github.com/fishjar/kiss-translator">KISS Translator</a> 제작'
    );

    // 6. 导出到英文时，章节末尾应注入英文注明
    const epubZip = fflate.zipSync(filesMap);
    const epubBook = await parseEpubBook(epubZip);
    const { uint8Array } = exportEpubFromChapterStates(
      epubBook,
      {},
      { toLang: "en" },
      { lang: "en" },
      "bilingual"
    );
    const unpacked = fflate.unzipSync(uint8Array);
    const ch1 = fflate.strFromU8(unpacked["OEBPS/ch1.xhtml"]);
    expect(ch1).toContain(
      'Made by <a href="https://github.com/fishjar/kiss-translator">KISS Translator</a>'
    );
  });

  test("translateEpubChapter 并发中遇到请求失败立即中止其余请求且不发生延迟进度污染（修复问题 6）", async () => {
    const twoParaXhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>First paragraph here.</p>
        <p>Second paragraph here.</p>
      </body>
    </html>`;

    const multiFilesMap = {
      ...filesMap,
      "OEBPS/ch_multi.xhtml": fflate.strToU8(twoParaXhtml),
    };

    let secondUnitSignalAborted = false;
    let progressCallsAfterError = 0;
    let failed = false;

    apiTranslate.mockImplementation(async ({ text, signal }) => {
      if (text.includes("First")) {
        throw new Error("第一个段落失败");
      }
      if (text.includes("Second")) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ trText: "第二段翻译" }),
            100
          );
          signal?.addEventListener("abort", () => {
            secondUnitSignalAborted = true;
            clearTimeout(timer);
            reject(new DOMException("已取消", "AbortError"));
          });
        });
      }
      return { trText: "默认翻译" };
    });

    let caughtError = null;
    try {
      await translateEpubChapter(
        "OEBPS/ch_multi.xhtml",
        multiFilesMap,
        scene,
        setting,
        null,
        () => {
          if (failed) {
            progressCallsAfterError++;
          }
        }
      );
    } catch (err) {
      failed = true;
      caughtError = err;
    }

    expect(caughtError?.message).toBe("第一个段落失败");

    // 等待超过第二单元的定时时间，确保已被中止收尾且无残留进度回调
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(secondUnitSignalAborted).toBe(true);
    expect(progressCallsAfterError).toBe(0);
  });

  test("全书翻译及导出时未列入 spine 的 NAV 文档与 NCX 目录同步更新（第八轮问题 1）", async () => {
    // 构造带未在 spine 中的 nav.xhtml 以及 toc.ncx 的双模电子书
    const testOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>双模目录书</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1" />
  </spine>
</package>`;

    const testNav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="ch1.xhtml">Chapter 1 English Title</a></li>
      </ol>
    </nav>
  </body>
</html>`;

    const testNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="p1" playOrder="1">
      <navLabel><text>Chapter 1 English Title</text></navLabel>
      <content src="ch1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

    const testCh1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>Chapter 1 English Title</h1>
    <p>Body paragraph text.</p>
  </body>
</html>`;

    const customFilesMap = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(testOpf),
      "OEBPS/nav.xhtml": fflate.strToU8(testNav),
      "OEBPS/toc.ncx": fflate.strToU8(testNcx),
      "OEBPS/ch1.xhtml": fflate.strToU8(testCh1),
    };

    const epubZip = fflate.zipSync(customFilesMap);
    const epubBook = await parseEpubBook(epubZip);

    // 验证 nav.xhtml 未在 spine 中
    expect(epubBook.spineItems.length).toBe(1);
    expect(epubBook.navItemHref).toBe("OEBPS/nav.xhtml");
    expect(epubBook.ncxItemHref).toBe("OEBPS/toc.ncx");

    // mock 翻译响应：翻译包含 Title 的文本时返回中文标题
    apiTranslate.mockImplementation(async ({ text }) => {
      if (text.includes("Chapter 1 English Title")) {
        return { trText: "第一章 中文标题" };
      }
      return { trText: "段落正文译文" };
    });

    const bookResult = await translateEpubBook(
      epubBook,
      scene,
      setting,
      null,
      null,
      {},
      {}
    );

    // 1. 验证未列入 spine 的 nav.xhtml 被成功翻译并更新写入
    const exportedNav = fflate.strFromU8(
      bookResult.targetFilesMap["OEBPS/nav.xhtml"]
    );
    expect(exportedNav).toContain("第一章 中文标题");
    expect(exportedNav).not.toContain("Chapter 1 English Title");

    // 2. 验证 toc.ncx 也被同步更新为中文标题
    const exportedNcx = fflate.strFromU8(
      bookResult.targetFilesMap["OEBPS/toc.ncx"]
    );
    expect(exportedNcx).toContain("<text>第一章 中文标题</text>");
    expect(exportedNcx).not.toContain("<text>Chapter 1 English Title</text>");
  });
});
