/* eslint-disable testing-library/render-result-naming-convention */
import {
  translateFileText,
  translateTxt,
  generateStandaloneHtml,
  escapeHtmlText,
} from "./fileTranslate";
import { apiTranslate } from "../apis";

jest.mock("../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("webextension-polyfill", () => ({}));

const setting = {
  transApis: [
    {
      apiSlug: "primary",
      apiType: "Microsoft",
      apiName: "Primary",
      sourceType: "network",
      capabilities: ["translation"],
    },
    {
      apiSlug: "backup",
      apiType: "Microsoft",
      apiName: "Backup",
      sourceType: "network",
      capabilities: ["translation"],
    },
  ],
  prompts: [],
  subtitleSetting: {},
};
const scene = {
  apiSlugs: ["primary", "backup"],
  fromLang: "auto",
  toLang: "zh-CN",
};

beforeEach(() => apiTranslate.mockReset());

test("preserves TXT line endings, blank lines and order while falling back", async () => {
  apiTranslate.mockImplementation(async ({ text, apiSetting }) => {
    if (apiSetting.apiSlug === "primary") throw new Error("offline");
    return { trText: `译:${text}` };
  });
  const result = await translateTxt("first\r\n\r\nsecond\n", scene, setting);
  expect(result.text).toBe("译:first\r\n\r\n译:second\n");
  expect(result.comparisons).toEqual([
    { source: "first", target: "译:first" },
    { source: "second", target: "译:second" },
  ]);
  expect(
    apiTranslate.mock.calls.map(([args]) => args.apiSetting.apiSlug)
  ).toEqual(["primary", "backup", "primary", "backup"]);
});

test("cancellation stops before requesting the next line", async () => {
  const abort = new AbortController();
  apiTranslate.mockImplementation(async () => ({ trText: "translated" }));
  await expect(
    translateTxt("one\ntwo", scene, setting, abort.signal, () => abort.abort())
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(apiTranslate).toHaveBeenCalledTimes(1);
});

test("installed local translation is used first and a failed local run falls back", async () => {
  apiTranslate.mockResolvedValue({ trText: "network output" });
  const localScene = { ...scene, apiSlugs: ["local", "backup"] };
  const localSetting = {
    ...setting,
    transApis: [
      {
        apiSlug: "local",
        apiType: "LocalAI",
        sourceType: "local",
        modelRef: "model-a",
        capabilities: ["translation"],
      },
      ...setting.transApis,
    ],
  };
  const local = {
    installedModels: new Set(["model-a"]),
    translate: jest.fn().mockRejectedValue(new Error("device lost")),
  };
  await expect(
    translateFileText("source", localScene, localSetting, undefined, local)
  ).resolves.toBe("network output");
  expect(local.translate).toHaveBeenCalledWith(
    "model-a",
    "source",
    "zh-CN",
    undefined
  );
  expect(apiTranslate).toHaveBeenCalledTimes(1);
});

describe("Markdown file translation", () => {
  const {
    maskInlineElements,
    unmaskInlineElements,
    splitMarkdownBlocks,
    renderMarkdownBlocksToHtml,
    translateMarkdown,
  } = require("./fileTranslate");

  test("masks and unmasks inline code, math, and links preserving URLs", () => {
    const raw =
      "Use `npm install` and $x = y^2$ with [Guide](https://example.com) and ![Logo](https://img.png)";
    const { masked, masks } = maskInlineElements(raw);
    expect(masked).not.toContain("`npm install`");
    expect(masked).not.toContain("$x = y^2$");
    expect(masked).not.toContain("https://example.com");
    expect(masked).toContain("[Guide]");
    expect(masks.length).toBe(4);

    const simulatedTranslated = masked
      .replace("Use", "使用")
      .replace("Guide", "指南")
      .replace("with", "配合");
    const restored = unmaskInlineElements(simulatedTranslated, masks);
    expect(restored).toBe(
      "使用 `npm install` and $x = y^2$ 配合 [指南](https://example.com) and ![Logo](https://img.png)"
    );
  });

  test("splits markdown into blocks and protects code fences and math blocks", () => {
    const md = `# Title\n\n\`\`\`javascript\nconsole.log("hello");\n\`\`\`\n\n$$E=mc^2$$\n\n- List item 1\n- List item 2\n\n> Quote block`;
    const blocks = splitMarkdownBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "blank",
      "code",
      "blank",
      "math",
      "blank",
      "list_item",
      "list_item",
      "blank",
      "blockquote",
    ]);
    const codeBlock = blocks.find((b) => b.type === "code");
    expect(codeBlock.translatable).toBe(false);
    expect(codeBlock.raw).toContain('console.log("hello");');
  });

  test("translates markdown preserving code blocks and generating bilingual and target versions", async () => {
    apiTranslate.mockImplementation(async ({ text }) => ({
      trText: `中:${text}`,
    }));
    const md = `# Introduction\n\nThis is a paragraph with \`code\`.\n\n\`\`\`python\nprint(1)\n\`\`\`\n\n- First point`;
    const result = await translateMarkdown(md, scene, setting);

    // 纯译文 Markdown：代码块原样保留，文本被翻译，行内代码被保护还原
    expect(result.translatedMd).toContain("# 中:Introduction");
    expect(result.translatedMd).toContain(
      "中:This is a paragraph with `code`."
    );
    expect(result.translatedMd).toContain("```python\nprint(1)\n```");
    expect(result.translatedMd).toContain("- 中:First point");

    // 双语对照 Markdown：包含原文和译文
    expect(result.bilingualMd).toContain("# Introduction");
    expect(result.bilingualMd).toContain("# 中:Introduction");
    expect(result.bilingualMd).toContain("This is a paragraph with `code`.");
    expect(result.bilingualMd).toContain("中:This is a paragraph with `code`.");

    // HTML 渲染包含预期结构
    expect(result.translatedHtml).toContain('<h1 class="kt-md-heading"');
    expect(result.translatedHtml).toContain("中:Introduction</h1>");
    expect(result.bilingualHtml).toContain('class="kt-md-bilingual-block"');
    expect(result.bilingualHtml).toContain('class="kt-md-source"');
    expect(result.bilingualHtml).toContain('class="kt-md-target');
  });

  test("translates markdown table cells and preserves table alignments", async () => {
    apiTranslate.mockImplementation(async ({ text }) => ({
      trText: `译:${text}`,
    }));
    const tableMd = `| Name | Age |\n| :--- | ---: |\n| Alice | 20 |\n| Bob | 25 |`;
    const { translateMarkdown } = require("./fileTranslate");
    const result = await translateMarkdown(tableMd, scene, setting);

    expect(result.translatedMd).toContain("| 译:Name | 译:Age |");
    expect(result.translatedMd).toContain("| :--- | ---: |");
    expect(result.translatedMd).toContain("| 译:Alice | 译:20 |");
    expect(result.translatedHtml).toContain("<table");
    expect(result.translatedHtml).toContain("译:Alice");
  });

  test("markdown translation abort signal cancels gracefully", async () => {
    const abort = new AbortController();
    apiTranslate.mockImplementation(async () => ({ trText: "ok" }));
    const { translateMarkdown } = require("./fileTranslate");
    await expect(
      translateMarkdown(
        "# H1\n\n# H2\n\n# H3",
        scene,
        setting,
        abort.signal,
        () => abort.abort()
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("keeps results blank before translation starts and only completed blocks are rendered on screen", () => {
    const md = "# Heading 1\n\nParagraph text\n\n> Blockquote";
    const blocks = splitMarkdownBlocks(md);

    // 未开始翻译时：没有任何块完成翻译，译文与双语模式均保持完全空白
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "target" })).toBe("");
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "bilingual" })).toBe("");

    // 原文模式（左栏）正常渲染完整原文
    expect(renderMarkdownBlocksToHtml(blocks, { mode: "source" })).toContain(
      "Heading 1"
    );

    // 模拟仅第一块（标题）完成翻译
    blocks[0].targetText = "标题 1";
    const partialTargetHtml = renderMarkdownBlocksToHtml(blocks, {
      mode: "target",
    });
    // 已完成的标题上屏
    expect(partialTargetHtml).toContain("标题 1");
    // 未完成翻译的段落与引用绝不上屏
    expect(partialTargetHtml).not.toContain("Paragraph text");
    expect(partialTargetHtml).not.toContain("Blockquote");

    // 双语模式下同样仅上屏已完成的段落
    const partialBilingualHtml = renderMarkdownBlocksToHtml(blocks, {
      mode: "bilingual",
    });
    expect(partialBilingualHtml).toContain("Heading 1");
    expect(partialBilingualHtml).toContain("标题 1");
    expect(partialBilingualHtml).not.toContain("Paragraph text");
  });

  test("concurrently schedules multiple markdown blocks to enable batching and streams blocks snapshot", async () => {
    let maxConcurrentCalls = 0;
    let currentConcurrentCalls = 0;
    const progressBlocksList = [];

    apiTranslate.mockImplementation(async ({ text }) => {
      currentConcurrentCalls++;
      if (currentConcurrentCalls > maxConcurrentCalls) {
        maxConcurrentCalls = currentConcurrentCalls;
      }
      // 模拟微延迟，以检测是否有并发调用重叠进入
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrentCalls--;
      return { trText: `译:${text}` };
    });

    const md = "# H1\n\n# H2\n\n# H3\n\n# H4\n\n# H5";
    const result = await translateMarkdown(
      md,
      scene,
      setting,
      undefined,
      (done, total, item, currentBlocks) => {
        progressBlocksList.push({
          done,
          total,
          hasBlocks: Boolean(currentBlocks),
        });
      }
    );

    // 验证并发调度：多个块同时进入翻译（maxConcurrentCalls > 1），触发 BatchQueue 打包
    expect(maxConcurrentCalls).toBeGreaterThan(1);
    expect(result.translatedMd).toContain("# 译:H1");
    expect(result.translatedMd).toContain("# 译:H5");

    // 验证流式回传参数正确带回了 blocks 快照
    expect(progressBlocksList.length).toBe(5);
    expect(progressBlocksList.every((p) => p.hasBlocks)).toBe(true);
  });

  test("generateStandaloneHtml produces valid HTML with style and body content", () => {
    const { generateStandaloneHtml } = require("./fileTranslate");
    const html = generateStandaloneHtml("<p>Hello</p>", "Doc Title");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Doc Title</title>");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("kt-md-source");
  });

  test("translateEntireTxt translates the full txt file in a single request", async () => {
    const { translateEntireTxt } = require("./fileTranslate");
    apiTranslate.mockResolvedValueOnce({ trText: "整篇译文内容" });
    const result = await translateEntireTxt("Full source text", scene, setting);
    expect(result.text).toBe("整篇译文内容");
    expect(result.isEntire).toBe(true);
    expect(apiTranslate).toHaveBeenCalledTimes(1);
  });

  test("translateEntireMarkdown masks code blocks and translates entire markdown", async () => {
    const { translateEntireMarkdown } = require("./fileTranslate");
    apiTranslate.mockImplementation(async ({ text }) => {
      expect(text).toContain("__KTCODEBLOCK_");
      expect(text).not.toContain("console.log('secret')");
      return { trText: text.replace("Hello", "你好") };
    });

    const md = "Hello world\n\n```js\nconsole.log('secret');\n```";
    const result = await translateEntireMarkdown(md, scene, setting);
    expect(result.isEntire).toBe(true);
    expect(result.translatedMd).toContain("你好 world");
    expect(result.translatedMd).toContain("console.log('secret');");
  });

  test("exportEpubFromChapterStates 支持部分章节翻译后导出真实双语 EPUB（兼容 bilingualHtml/targetHtml）", () => {
    const fflate = require("fflate");
    const { exportEpubFromChapterStates } = require("./fileTranslate");

    const mockBook = {
      title: "短篇小说选集",
      opfPath: "OEBPS/content.opf",
      opfDir: "OEBPS/",
      spineItems: [
        { id: "ch1", href: "ch1.xhtml", fullPath: "OEBPS/ch1.xhtml", title: "Chapter 1" },
        { id: "ch2", href: "ch2.xhtml", fullPath: "OEBPS/ch2.xhtml", title: "Chapter 2" },
      ],
      filesMap: {
        "OEBPS/content.opf": fflate.strToU8(
          `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>短篇小说选集</dc:title></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`
        ),
        "OEBPS/ch1.xhtml": fflate.strToU8(`<html><body><p>Source chapter 1</p></body></html>`),
        "OEBPS/ch2.xhtml": fflate.strToU8(`<html><body><p>Source chapter 2</p></body></html>`),
      },
    };

    // 模拟用户只试译了 ch1，且仅存在 bilingualHtml 字段
    const chapterStates = {
      "OEBPS/ch1.xhtml": {
        status: "done",
        sourceHtml: `<html><body><p>Source chapter 1</p></body></html>`,
        bilingualHtml: `<html><body><p>Source chapter 1</p><p class="kt-bilingual-target">第一章双语译文</p></body></html>`,
      },
    };

    const { uint8Array, filename, hasAnyTranslated } = exportEpubFromChapterStates(
      mockBook,
      chapterStates,
      { toLang: "zh-CN" },
      {},
      "bilingual"
    );

    expect(hasAnyTranslated).toBe(true);
    expect(filename).toContain(".bilingual.epub");

    // 解压验证导出的双语 EPUB
    const unzipped = fflate.unzipSync(uint8Array);
    const ch1Content = fflate.strFromU8(unzipped["OEBPS/ch1.xhtml"]);
    const ch2Content = fflate.strFromU8(unzipped["OEBPS/ch2.xhtml"]);

    // ch1 包含双语对照
    expect(ch1Content).toContain("第一章双语译文");
    expect(ch1Content).toContain("Source chapter 1");

    // ch2 保留未翻译原文
    expect(ch2Content).toContain("Source chapter 2");
    expect(ch2Content).not.toContain("第一章双语译文");
  });

  test("escapeHtmlText 与 generateStandaloneHtml 对包含恶意脚本的 title 严格转义，杜绝闭合标签注入（第三轮修复问题 1）", () => {
    const maliciousTitle = '</title><script>alert("xss")</script><title>';
    const escaped = escapeHtmlText(maliciousTitle);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");

    const html = generateStandaloneHtml("<p>Hello World</p>", maliciousTitle);
    // 验证导出的完整 HTML 中绝不存在未经转义的真实 <script> 标签
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  test("generateStandaloneHtml 支持自定义 lang 参数并在 html 标签中正确声明（第五轮问题 3）", () => {
    const { generateStandaloneHtml } = require("./fileTranslate");
    const enHtml = generateStandaloneHtml("<p>Hello</p>", "Title", "", "en");
    expect(enHtml).toContain('<html lang="en">');

    const jaHtml = generateStandaloneHtml("<p>こんにちは</p>", "Title", "", "ja");
    expect(jaHtml).toContain('<html lang="ja">');
  });

  test("exportEpubFromChapterStates 纯译文导出按实际目标语言生成文件名后缀（第五轮问题 3）", () => {
    const fflate = require("fflate");
    const { exportEpubFromChapterStates } = require("./fileTranslate");
    const mockBook = {
      title: "Novel",
      opfPath: "content.opf",
      spineItems: [{ id: "c1", href: "c1.xhtml", fullPath: "c1.xhtml" }],
      filesMap: {
        "content.opf": fflate.strToU8(
          `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
        ),
        "c1.xhtml": fflate.strToU8("<html><body><p>Hello</p></body></html>"),
      },
    };
    const chapterStates = {
      "c1.xhtml": {
        status: "done",
        targetHtml: "<html><body><p>Hola</p></body></html>",
      },
    };

    // 导出目标语言为西班牙语 es
    const esExport = exportEpubFromChapterStates(
      mockBook,
      chapterStates,
      { toLang: "es" },
      {},
      "target"
    );
    expect(esExport.filename).toBe("Novel.es.epub");

    // 导出目标语言为日语 ja
    const jaExport = exportEpubFromChapterStates(
      mockBook,
      chapterStates,
      { toLang: "ja" },
      {},
      "target"
    );
    expect(jaExport.filename).toBe("Novel.ja.epub");
  });

  test("translateEpubBook 返回惰性打包 getter，避免收尾时无谓的全书重复打包（第五轮问题 4）", async () => {
    const fflate = require("fflate");
    const { translateEpubBook } = require("./fileTranslate");
    const mockBook = {
      title: "LazyBook",
      opfPath: "content.opf",
      spineItems: [{ id: "c1", href: "c1.xhtml", fullPath: "c1.xhtml" }],
      filesMap: {
        "content.opf": fflate.strToU8(
          `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
        ),
        "c1.xhtml": fflate.strToU8("<html><body><p>Sentence 1</p></body></html>"),
      },
    };

    apiTranslate.mockResolvedValue({ trText: "第一句" });

    const result = await translateEpubBook(
      mockBook,
      scene,
      setting,
      new AbortController().signal
    );

    expect(result.chapterResults).toBeDefined();
    // 验证 getter 存在且惰性生效
    expect(typeof Object.getOwnPropertyDescriptor(result, "bilingualBlob").get).toBe("function");
    expect(result.bilingualBlob).toBeInstanceOf(Blob);
    expect(result.targetBlob).toBeInstanceOf(Blob);
  });

  test("exportEpubFromChapterStates 严格隔离不同目标语言的章节译文（第七轮问题 1）", () => {
    const fflate = require("fflate");
    const { exportEpubFromChapterStates } = require("./fileTranslate");
    const rawXhtml = "<html><body><p>Original Text</p></body></html>";
    const mockBook = {
      title: "LangIsolateBook",
      opfPath: "content.opf",
      spineItems: [{ id: "c1", href: "c1.xhtml", fullPath: "c1.xhtml" }],
      filesMap: {
        "content.opf": fflate.strToU8(
          `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
        ),
        "c1.xhtml": fflate.strToU8(rawXhtml),
      },
    };

    // 假设该章节此前被翻译为英文 (targetLang: 'en')
    const chapterStates = {
      "c1.xhtml": {
        status: "done",
        targetLang: "en",
        bilingualHtml: "<p>Original Text</p><p>English Trans</p>",
        targetHtml: "<p>English Trans</p>",
        bilingualXhtml: "<p>Original Text</p><p>English Trans</p>",
        targetXhtml: "<p>English Trans</p>",
      },
    };

    // 当前用户选择导出目标语言为日语 'ja'
    const jaExport = exportEpubFromChapterStates(
      mockBook,
      chapterStates,
      { toLang: "ja" },
      {},
      "bilingual"
    );

    // 1. 因为 targetLang ('en') 与当前场景 toLang ('ja') 不匹配，hasAnyTranslated 为 false
    expect(jaExport.hasAnyTranslated).toBe(false);

    // 2. 解包导出的 EPUB，验证 c1.xhtml 中绝不包含旧英文译文，保持原始正文
    const unzipped = fflate.unzipSync(jaExport.uint8Array);
    const c1Content = fflate.strFromU8(unzipped["c1.xhtml"]);
    expect(c1Content).not.toContain("English Trans");
    expect(c1Content).toContain("Original Text");
  });

  test("translateEpubBook 翻译全书时保持 epubBook.filesMap 只读，改写后的 NCX 仅保存在导出结果中（第九轮缺陷修复）", async () => {
    const fflate = require("fflate");
    const { translateEpubBook } = require("./fileTranslate");
    const originalNcxStr = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter 1 Original</text></navLabel>
      <content src="c1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
    const originalNcxBytes = fflate.strToU8(originalNcxStr);

    const mockBook = {
      title: "NcxReadOnlyBook",
      opfPath: "content.opf",
      ncxItemHref: "toc.ncx",
      spineItems: [{ id: "c1", href: "c1.xhtml", fullPath: "c1.xhtml" }],
      tocItems: [{ id: "c1", title: "Chapter 1 Original", href: "c1.xhtml", fullPath: "c1.xhtml", hash: "" }],
      filesMap: {
        "content.opf": fflate.strToU8(
          `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:language>en</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
        ),
        "c1.xhtml": fflate.strToU8("<html><body><h1>Chapter 1 Heading</h1><p>Sentence 1</p></body></html>"),
        "toc.ncx": new Uint8Array(originalNcxBytes),
      },
    };

    apiTranslate.mockImplementation(({ text }) => {
      if (text.includes("Chapter 1 Heading")) return Promise.resolve({ trText: "第一章 标题" });
      if (text.includes("Sentence 1")) return Promise.resolve({ trText: "第一句" });
      return Promise.resolve({ trText: `译:${text}` });
    });

    const result = await translateEpubBook(
      mockBook,
      { ...scene, toLang: "zh-CN" },
      setting,
      new AbortController().signal
    );

    // 1. 验证 mockBook.filesMap['toc.ncx'] 严格保持不变，未被就地修改
    expect(fflate.strFromU8(mockBook.filesMap["toc.ncx"])).toBe(originalNcxStr);

    // 2. 验证导出的 EPUB 中包含翻译后的 NCX 目录条目
    const targetExport = result.targetFilesMap;
    const exportedNcxStr = fflate.strFromU8(targetExport["toc.ncx"]);
    expect(exportedNcxStr).toContain("第一章 标题");
    expect(exportedNcxStr).not.toContain("Chapter 1 Original");

    // 3. 再次翻译同一本书（例如切换目标语言为日语 ja），验证其读取的仍是原始 NCX 英文原文作为输入
    apiTranslate.mockImplementation(({ text }) => {
      return Promise.resolve({ trText: `JA:${text}` });
    });

    await translateEpubBook(
      mockBook,
      { ...scene, toLang: "ja" },
      setting,
      new AbortController().signal
    );

    // 确认第二次翻译时，原始输入 mockBook.filesMap['toc.ncx'] 依然是原初英文
    expect(fflate.strFromU8(mockBook.filesMap["toc.ncx"])).toBe(originalNcxStr);
  });
});
