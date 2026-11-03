import * as fflate from "fflate";
import {
  updateOpfDocument,
  getRelativePath,
  injectCssIntoXhtml,
  packEpub,
  packEpubUint8Array,
} from "./epubPacker";

describe("epubPacker 测试套件", () => {
  test("updateOpfDocument 更新元数据与注册 CSS", () => {
    const rawOpf = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Great Novel</dc:title>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="ch1"/></spine>
    </package>`;

    const updated = updateOpfDocument(rawOpf, {
      toLang: "zh-CN",
      titleSuffix: " [双语对照]",
      cssHref: "styles/kiss-translator-epub.css",
    });

    expect(updated).toContain("Great Novel [双语对照]");
    expect(updated).toContain("zh-CN");
    expect(updated).toContain('href="styles/kiss-translator-epub.css"');
    expect(updated).toContain('id="kt-epub-css"');
    expect(updated).not.toContain('xmlns=""');
  });

  test("updateOpfDocument 注册 CSS 项时继承 OPF 命名空间且不产生 xmlns=''", () => {
    const rawOpf = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Great Novel</dc:title>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="ch1"/></spine>
    </package>`;

    const updated = updateOpfDocument(rawOpf, {
      cssHref: "styles/kiss-translator-epub.css",
    });

    expect(updated).not.toContain('xmlns=""');
    expect(updated).toContain('id="kt-epub-css"');
    expect(updated).toContain("<dc:language>en</dc:language>");
  });

  test("updateOpfDocument 传入空语言或未提供 toLang 时严格保留原书语言", () => {
    const rawOpf = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Original Book</dc:title>
        <dc:language>ja</dc:language>
      </metadata>
      <manifest></manifest>
      <spine></spine>
    </package>`;

    const updatedEmpty = updateOpfDocument(rawOpf, { toLang: "" });
    expect(updatedEmpty).toContain("<dc:language>ja</dc:language>");

    const updatedUndefined = updateOpfDocument(rawOpf, {});
    expect(updatedUndefined).toContain("<dc:language>ja</dc:language>");
  });

  test("getRelativePath 相对引用路径计算", () => {
    expect(
      getRelativePath("OEBPS/text/ch01.xhtml", "OEBPS/styles/kt.css")
    ).toBe("../styles/kt.css");
    expect(getRelativePath("OEBPS/ch01.xhtml", "OEBPS/kt.css")).toBe("kt.css");
  });

  test("injectCssIntoXhtml 样式链接注入", () => {
    const xhtml = `<html><head><title>Test</title></head><body><p>Hello</p></body></html>`;
    const injected = injectCssIntoXhtml(xhtml, "styles/kt.css");

    expect(injected).toContain(
      '<link rel="stylesheet" type="text/css" href="styles/kt.css" />'
    );
    expect(injected).toContain("</head>");
  });

  test("packEpub 打包并保证首条目为 mimetype 且无压缩", () => {
    const filesMap = {
      "META-INF/container.xml": fflate.strToU8("<container/>"),
      "OEBPS/content.opf": fflate.strToU8("<package/>"),
      "OEBPS/ch1.xhtml": fflate.strToU8("<html/>"),
    };

    const blob = packEpub(filesMap);
    expect(blob.type).toBe("application/epub+zip");

    // 解包并检查二进制
    const uint8 = packEpubUint8Array(filesMap);
    const unzipped = fflate.unzipSync(uint8);
    const keys = Object.keys(unzipped);

    // 校验第 1 项必须为 mimetype
    expect(keys[0]).toBe("mimetype");
    expect(fflate.strFromU8(unzipped["mimetype"])).toBe("application/epub+zip");
    expect(unzipped["OEBPS/ch1.xhtml"]).toBeDefined();
  });

  test("getEpubFooterHtml 与 injectFooterIntoXhtml 生成居中文本与优雅短线分隔符注明", () => {
    const {
      getEpubFooterHtml,
      injectFooterIntoXhtml,
    } = require("./epubPacker");
    const footerZh = getEpubFooterHtml("zh");

    // 校验文本居中
    expect(footerZh).toContain('align="center"');
    expect(footerZh).toContain("text-align: center !important");
    expect(footerZh).toContain("KISS Translator");
    expect(footerZh).toContain("https://github.com/fishjar/kiss-translator");

    // 校验左右短线分隔符与纯文本容器
    expect(footerZh).toContain("kt-epub-footer-line");
    expect(footerZh).toContain("kt-epub-footer-text");
    expect(footerZh).toContain("width: 48px");

    // 测试注入到 XHTML
    const rawXhtml = `<html><head><title>Title</title></head><body><p>Content</p></body></html>`;
    const injected = injectFooterIntoXhtml(rawXhtml, "zh");
    expect(injected).toContain("kt-epub-footer");
    expect(injected).toContain("kt-epub-footer-line");
    expect(injected).toContain("kt-epub-footer-text");
    expect(injected).toContain("</body>");
  });

  test("空章节自闭合 body 标签经 injectFooterIntoXhtml 展开并保持合规 XML（第四轮问题 3）", () => {
    const { injectFooterIntoXhtml } = require("./epubPacker");
    const emptyChapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Empty</title></head>
  <body class="empty-chapter"/>
</html>`;

    const injected = injectFooterIntoXhtml(emptyChapterXhtml, "zh");

    // 验证自闭合 body 被展开为成对 body，footer 在 body 内部
    expect(injected).toContain('<body class="empty-chapter">');
    expect(injected).toContain("kt-epub-footer");
    expect(injected).toContain("</body>");

    // 验证 </html> 是最后闭合的根元素标签，绝无内容溢出到 </html> 之后
    const afterHtmlClose = injected.split("</html>")[1]?.trim();
    expect(afterHtmlClose).toBe("");

    // 验证严格的 XML DOMParser 解析无 parsererror
    const parser = new DOMParser();
    const doc = parser.parseFromString(injected, "application/xhtml+xml");
    const parserError = doc.querySelector("parsererror");
    expect(parserError).toBeNull();
    expect(doc.documentElement.tagName.toLowerCase()).toBe("html");
    expect(doc.querySelector(".kt-epub-footer")).not.toBeNull();
  });

  test("自闭合 head 与无 head 章节经 injectCssIntoXhtml 正确引入 CSS 且保持合规 XML（第五轮问题 2）", () => {
    const { injectCssIntoXhtml } = require("./epubPacker");
    const selfClosingHeadXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head class="custom-head"/>
  <body><p>Content</p></body>
</html>`;

    const injected = injectCssIntoXhtml(
      selfClosingHeadXhtml,
      "../styles/kiss-translator-epub.css"
    );

    // 验证自闭合 head 成功展开并注入 link 样式表
    expect(injected).toContain('<head class="custom-head">');
    expect(injected).toContain(
      '<link rel="stylesheet" type="text/css" href="../styles/kiss-translator-epub.css" />'
    );
    expect(injected).toContain("</head>");

    // 验证严格 XML 解析无错误
    const parser = new DOMParser();
    const doc = parser.parseFromString(injected, "application/xhtml+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const linkEl = doc.querySelector("link[rel='stylesheet']");
    expect(linkEl).not.toBeNull();
    expect(linkEl.getAttribute("href")).toBe(
      "../styles/kiss-translator-epub.css"
    );

    // 验证缺失 head 的 HTML 也会正确创建 head 并注入 link
    const noHeadXhtml = `<html><body><p>No head</p></body></html>`;
    const injectedNoHead = injectCssIntoXhtml(
      noHeadXhtml,
      "styles/kiss-translator-epub.css"
    );
    expect(injectedNoHead).toContain("<head>");
    expect(injectedNoHead).toContain("styles/kiss-translator-epub.css");
    expect(injectedNoHead).toContain("</head>");
  });

  test("updateNavDocument 与 updateNcxDocument 同步更新目录条目（第八轮问题 1）", () => {
    const {
      updateNavDocument,
      updateNcxDocument,
      extractTitleMapFromChapterStates,
    } = require("./epubPacker");

    // 1. 测试 updateNavDocument
    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="text/ch1.xhtml">Chapter 1</a></li>
        <li><a href="text/ch2.xhtml#sec1">Section 1.1</a></li>
      </ol>
    </nav>
  </body>
</html>`;

    const titleMap = new Map([
      ["OEBPS/text/ch1.xhtml", "第一章 开始"],
      ["OEBPS/text/ch2.xhtml#sec1", "第1.1节 概览"],
    ]);

    const updatedNav = updateNavDocument(navXhtml, titleMap, "OEBPS/");
    expect(updatedNav).toContain("第一章 开始");
    expect(updatedNav).toContain("第1.1节 概览");
    expect(updatedNav).not.toContain("Chapter 1");

    // 2. 测试 updateNcxDocument
    const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="text/ch1.xhtml"/>
    </navPoint>
    <navPoint id="np2" playOrder="2">
      <navLabel><text>Section 1.1</text></navLabel>
      <content src="text/ch2.xhtml#sec1"/>
    </navPoint>
  </navMap>
</ncx>`;

    const updatedNcx = updateNcxDocument(ncxXml, titleMap, "OEBPS/");
    expect(updatedNcx).toContain("<text>第一章 开始</text>");
    expect(updatedNcx).toContain("<text>第1.1节 概览</text>");
    expect(updatedNcx).not.toContain("<text>Chapter 1</text>");

    // 3. 测试 extractTitleMapFromChapterStates 从已翻译章节中提取标题
    const mockBook = {
      spineItems: [{ fullPath: "OEBPS/text/ch1.xhtml" }],
      tocItems: [{ fullPath: "OEBPS/text/ch1.xhtml", hash: "" }],
    };
    const mockStates = {
      "OEBPS/text/ch1.xhtml": {
        status: "done",
        targetHtml: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 旅程开启</h1><p>正文内容</p></body></html>`,
      },
    };
    const extractedMap = extractTitleMapFromChapterStates(
      mockBook,
      mockStates,
      "target"
    );
    expect(extractedMap.get("OEBPS/text/ch1.xhtml")).toBe("第一章 旅程开启");
  });

  test("extractTitleMapFromChapterStates 正确识别标题前置的空锚点并提取各小节独立标题", () => {
    const {
      extractTitleMapFromChapterStates,
      updateNcxDocument,
      updateNavDocument,
    } = require("./epubPacker");

    const mockBook = {
      spineItems: [{ fullPath: "OEBPS/text/ch1.xhtml" }],
      tocItems: [
        { fullPath: "OEBPS/text/ch1.xhtml", hash: "" },
        { fullPath: "OEBPS/text/ch1.xhtml", hash: "sec1" },
        { fullPath: "OEBPS/text/ch1.xhtml", hash: "sec2" },
        { fullPath: "OEBPS/text/ch1.xhtml", hash: "sec3" },
      ],
    };

    const mockStates = {
      "OEBPS/text/ch1.xhtml": {
        status: "done",
        targetHtml: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>
          <h1>第一章 核心技术</h1>
          <a id="sec1"></a>
          <h2>1.1 架构设计</h2>
          <p>正文段落</p>
          <p><a id="sec2"></a></p>
          <h3>1.2 缓存机制</h3>
          <p>更多正文</p>
          <h2><a id="sec3"></a>1.3 性能优化</h2>
        </body></html>`,
      },
    };

    const extractedMap = extractTitleMapFromChapterStates(
      mockBook,
      mockStates,
      "target"
    );

    expect(extractedMap.get("OEBPS/text/ch1.xhtml")).toBe("第一章 核心技术");
    expect(extractedMap.get("OEBPS/text/ch1.xhtml#sec1")).toBe("1.1 架构设计");
    expect(extractedMap.get("OEBPS/text/ch1.xhtml#sec2")).toBe("1.2 缓存机制");
    expect(extractedMap.get("OEBPS/text/ch1.xhtml#sec3")).toBe("1.3 性能优化");

    // 验证同章多个目录项在 NCX 中不会被篡改为同一章标题
    const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np0"><navLabel><text>Chapter 1</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
    <navPoint id="np1"><navLabel><text>Section 1.1</text></navLabel><content src="text/ch1.xhtml#sec1"/></navPoint>
    <navPoint id="np2"><navLabel><text>Section 1.2</text></navLabel><content src="text/ch1.xhtml#sec2"/></navPoint>
    <navPoint id="np-unmatched"><navLabel><text>Section Unmatched</text></navLabel><content src="text/ch1.xhtml#not_in_map"/></navPoint>
  </navMap>
</ncx>`;

    const updatedNcx = updateNcxDocument(ncxXml, extractedMap, "OEBPS/");
    expect(updatedNcx).toContain("<text>第一章 核心技术</text>");
    expect(updatedNcx).toContain("<text>1.1 架构设计</text>");
    expect(updatedNcx).toContain("<text>1.2 缓存机制</text>");
    // 未匹配到的子锚点项绝不能回退为整章主标题
    expect(updatedNcx).toContain("<text>Section Unmatched</text>");
    expect(updatedNcx).not.toContain(
      '<text>第一章 核心技术</text><content src="text/ch1.xhtml#not_in_map"'
    );
  });
});
