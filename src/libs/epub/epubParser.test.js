import * as fflate from "fflate";
import { parseEpubBook, normalizePath } from "./epubParser";

describe("epubParser 测试套件", () => {
  test("normalizePath 路径规范化测试", () => {
    expect(normalizePath("OEBPS/text/../ch01.xhtml")).toBe("OEBPS/ch01.xhtml");
    expect(normalizePath("text/./sub/ch.html")).toBe("text/sub/ch.html");
    expect(normalizePath("OEBPS/ch1.xhtml")).toBe("OEBPS/ch1.xhtml");
  });

  test("成功解析标准可重排 EPUB 3 书籍", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>测试书籍标题</dc:title>
        <dc:creator>测试作者</dc:creator>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
        <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml" />
      </manifest>
      <spine>
        <itemref idref="ch1" />
        <itemref idref="ch2" />
      </spine>
    </package>`;

    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
      <body>
        <nav epub:type="toc">
          <ol>
            <li><a href="ch1.xhtml">第一章：序幕</a></li>
            <li><a href="ch2.xhtml">第二章：展开</a></li>
          </ol>
        </nav>
      </body>
    </html>`;

    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body><h1>第一章：序幕</h1><p>在很久很久以前，发生了一个奇妙的故事。</p></body>
    </html>`;

    const ch2Xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body><h1>第二章：展开</h1><p>故事继续展开，迎来了高潮。</p></body>
    </html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "EPUB/content.opf": fflate.strToU8(opfXml),
      "EPUB/nav.xhtml": fflate.strToU8(navXhtml),
      "EPUB/ch1.xhtml": fflate.strToU8(ch1Xhtml),
      "EPUB/ch2.xhtml": fflate.strToU8(ch2Xhtml),
    };

    const epubBuffer = fflate.zipSync(zipData);
    const result = await parseEpubBook(epubBuffer);

    expect(result.title).toBe("测试书籍标题");
    expect(result.creator).toBe("测试作者");
    expect(result.language).toBe("en");
    expect(result.isEpub3).toBe(true);
    expect(result.spineItems.length).toBe(2);
    expect(result.spineItems[0].fullPath).toBe("EPUB/ch1.xhtml");
    expect(result.spineItems[0].title).toBe("第一章：序幕");
    expect(result.spineItems[1].fullPath).toBe("EPUB/ch2.xhtml");
    expect(result.spineItems[1].title).toBe("第二章：展开");
    expect(result.tocItems.length).toBe(2);
    expect(result.totalEstimatedWords).toBeGreaterThan(0);
  });

  test("成功解析兼顾模式下的 EPUB 2（NCX 目录）", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="2.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>EPUB2经典书籍</dc:title>
        <dc:creator>老作者</dc:creator>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
      </manifest>
      <spine toc="ncx">
        <itemref idref="ch1" />
      </spine>
    </package>`;

    const ncxXml = `<?xml version="1.0" encoding="utf-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <navMap>
        <navPoint id="np-1" playOrder="1">
          <navLabel><text>第一章 NCX标题</text></navLabel>
          <content src="ch1.xhtml"/>
        </navPoint>
      </navMap>
    </ncx>`;

    const ch1Xhtml = `<html><body><p>正文内容</p></body></html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/toc.ncx": fflate.strToU8(ncxXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    };

    const epubBuffer = fflate.zipSync(zipData);
    const result = await parseEpubBook(epubBuffer);

    expect(result.title).toBe("EPUB2经典书籍");
    expect(result.isEpub3).toBe(false);
    expect(result.tocItems.length).toBe(1);
    expect(result.tocItems[0].title).toBe("第一章 NCX标题");
    expect(result.spineItems[0].title).toBe("第一章 NCX标题");
  });

  test("拦截带有 DRM 加密文本的电子书", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const encXml = `<?xml version="1.0"?>
    <encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <EncryptedData>
        <CipherData><CipherReference URI="OEBPS/chapter1.xhtml"/></CipherData>
      </EncryptedData>
    </encryption>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "META-INF/encryption.xml": fflate.strToU8(encXml),
      "OEBPS/content.opf": fflate.strToU8("<package></package>"),
    };

    const epubBuffer = fflate.zipSync(zipData);
    await expect(parseEpubBook(epubBuffer)).rejects.toThrow("DRM 加密保护");
  });

  test("路径包含 chapter/text 的字体混淆文件不误报 DRM，正常解析", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>字体混淆测试书</dc:title>
      </metadata>
      <manifest>
        <item id="c1" href="section1.xhtml" media-type="application/xhtml+xml"/>
        <item id="f1" href="text/chapter-font.otf" media-type="font/otf"/>
      </manifest>
      <spine>
        <itemref idref="c1"/>
      </spine>
    </package>`;

    // 加密文件中指向带有 text/ 和 chapter 的字体，算法为 IDPF Font Obfuscation
    const encXml = `<?xml version="1.0"?>
    <encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
      <enc:EncryptedData>
        <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
        <enc:CipherData>
          <enc:CipherReference URI="OEBPS/text/chapter-font.otf"/>
        </enc:CipherData>
      </enc:EncryptedData>
    </encryption>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "META-INF/encryption.xml": fflate.strToU8(encXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/section1.xhtml": fflate.strToU8(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>`
      ),
      "OEBPS/text/chapter-font.otf": new Uint8Array([0, 1, 2, 3]),
    };

    const epubBuffer = fflate.zipSync(zipData);
    const result = await parseEpubBook(epubBuffer);
    expect(result.title).toBe("字体混淆测试书");
    expect(result.spineItems.length).toBe(1);
  });

  test("任意命名的正文加密（如 content_01.dat）精准拦截 DRM", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    // 正文叫 content_01.dat，未包含 text/ 或 .xhtml 或 chapter 等旧关键词，但属于 spine 与 xhtml
    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>特殊命名正文加密书</dc:title>
      </metadata>
      <manifest>
        <item id="c1" href="content_01.dat" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="c1"/>
      </spine>
    </package>`;

    const encXml = `<?xml version="1.0"?>
    <encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
      <enc:EncryptedData>
        <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
        <enc:CipherData>
          <enc:CipherReference URI="OEBPS/content_01.dat"/>
        </enc:CipherData>
      </enc:EncryptedData>
    </encryption>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "META-INF/encryption.xml": fflate.strToU8(encXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/content_01.dat": new Uint8Array([0, 1, 2, 3]),
    };

    const epubBuffer = fflate.zipSync(zipData);
    await expect(parseEpubBook(epubBuffer)).rejects.toThrow("DRM 加密保护");
  });

  test("拦截固定版式 (Fixed-layout) 电子书", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata>
        <meta property="rendition:layout">pre-paginated</meta>
      </metadata>
      <manifest></manifest>
      <spine></spine>
    </package>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
    };

    const epubBuffer = fflate.zipSync(zipData);
    await expect(parseEpubBook(epubBuffer)).rejects.toThrow("固定版式");
  });

  test("成功解析带二级嵌套小节与锚点的 NCX 目录树", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="2.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>多级嵌套电子书</dc:title>
      </metadata>
      <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml" />
      </manifest>
      <spine toc="ncx">
        <itemref idref="ch1" />
      </spine>
    </package>`;

    const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <navMap>
        <navPoint id="np-1">
          <navLabel><text>第一部 追逐者</text></navLabel>
          <content src="ch1.xhtml#part1"/>
          <navPoint id="np-1-1">
            <navLabel><text>第 I 节</text></navLabel>
            <content src="ch1.xhtml#part1-1"/>
          </navPoint>
          <navPoint id="np-1-2">
            <navLabel><text>第 II 节</text></navLabel>
            <content src="ch1.xhtml#part1-2"/>
          </navPoint>
        </navPoint>
      </navMap>
    </ncx>`;

    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <h1 id="part1">第一部 追逐者</h1>
        <h2 id="part1-1">第 I 节</h2>
        <p>小节一内容</p>
        <h2 id="part1-2">第 II 节</h2>
        <p>小节二内容</p>
      </body>
    </html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/toc.ncx": fflate.strToU8(ncxXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    };

    const epubBuffer = fflate.zipSync(zipData);
    const result = await parseEpubBook(epubBuffer);

    expect(result.tocTree.length).toBe(1);
    expect(result.tocTree[0].title).toBe("第一部 追逐者");
    expect(result.tocTree[0].hash).toBe("part1");
    expect(result.tocTree[0].children.length).toBe(2);
    expect(result.tocTree[0].children[0].title).toBe("第 I 节");
    expect(result.tocTree[0].children[0].hash).toBe("part1-1");
    expect(result.tocTree[0].children[1].title).toBe("第 II 节");
    expect(result.tocTree[0].children[1].hash).toBe("part1-2");
    expect(result.tocItems.length).toBe(3);
  });

  test("成功解析真实古登堡电子书 pg79656 的完整目录树（30个顶级章节与二级小节）", async () => {
    const fs = require("fs");
    const path = "tmp/pg79656-images-3.epub";
    if (!fs.existsSync(path)) return;
    const buf = fs.readFileSync(path);
    const result = await parseEpubBook(buf);

    expect(result.spineItems.length).toBe(10);
    expect(result.tocTree.length).toBe(30);
    const sunChaser = result.tocTree.find((n) =>
      n.title.includes("THE SUN CHASER")
    );
    expect(sunChaser).toBeDefined();
    expect(sunChaser.children.length).toBe(12);
    expect(sunChaser.children[0].title).toBe("I");
  });

  test("URL 编码清单路径解析与 ZIP 文件名精准匹配（修复问题 2）", async () => {
    const containerXml = `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`;

    // 清单中写 chapter%201.xhtml，实际 zip 文件名为 chapter 1.xhtml
    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>URL Encoded EPUB Test</dc:title>
      </metadata>
      <manifest>
        <item id="ch1" href="chapter%201.xhtml" media-type="application/xhtml+xml"/>
        <item id="nav" href="nav%20doc.xhtml" properties="nav" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="ch1"/>
      </spine>
    </package>`;

    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
      <body>
        <nav epub:type="toc">
          <ol>
            <li><a href="chapter%201.xhtml#sec%201">Chapter 1 Section 1</a></li>
          </ol>
        </nav>
      </body>
    </html>`;

    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <h1 id="sec 1">Chapter 1 Section 1</h1>
        <p>Testing URL encoded file path.</p>
      </body>
    </html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/nav doc.xhtml": fflate.strToU8(navXhtml),
      "OEBPS/chapter 1.xhtml": fflate.strToU8(ch1Xhtml),
    };

    const epubBuffer = fflate.zipSync(zipData);
    const result = await parseEpubBook(epubBuffer);

    expect(result.spineItems.length).toBe(1);
    expect(result.spineItems[0].fullPath).toBe("OEBPS/chapter 1.xhtml");
    expect(result.tocTree.length).toBe(1);
    expect(result.tocTree[0].fullPath).toBe("OEBPS/chapter 1.xhtml");
    expect(result.tocTree[0].hash).toBe("sec 1");
  });
});
