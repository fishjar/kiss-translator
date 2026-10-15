import {
  parseXhtmlToDoc,
  healEpubPagebreaks,
  maskEpubInlineElements,
  unmaskEpubInlineElements,
  extractTranslatableUnits,
  applyTranslationToDoc,
  serializeDocToXhtml,
  resolveEpubImages,
  embedEpubImagesAsDataUrls,
  setSafeXmlInnerHtml,
  sanitizeEpubMarkup,
  cssUnescape,
  cleanCssRemoteUrls,
} from "./epubDomHandler";

describe("epubDomHandler 测试套件", () => {
  test("XHTML 解析为 DOM 并识别块级元素", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <h1>Chapter Title</h1>
        <p>This is a normal paragraph.</p>
        <pre><code>console.log('do not translate');</code></pre>
        <p>123.45</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 应该只提取 h1 和 正常的 p，pre/code 以及纯数字 p 应跳过
    expect(units.length).toBe(2);
    expect(units[0].element.tagName.toUpperCase()).toBe("H1");
    expect(units[0].rawHtml).toBe("Chapter Title");
    expect(units[1].element.tagName.toUpperCase()).toBe("P");
    expect(units[1].rawHtml).toBe("This is a normal paragraph.");
  });

  test("行内富文本占位符保护与精准还原", () => {
    const rawHtml =
      'Please see footnote <sup class="fn"><a href="#fn1">[1]</a></sup> and <img src="icon.png" alt="star"/> for <em>emphasis</em>.';
    const { masked, masks } = maskEpubInlineElements(rawHtml);

    expect(masked).not.toContain('<a href="#fn1">');
    expect(masked).not.toContain('<img src="icon.png"');
    expect(masks.length).toBeGreaterThanOrEqual(2);

    // 模拟翻译（接口保留占位符，翻译周边词汇）
    const simulatedTranslated = masked
      .replace("Please see footnote", "请参见注脚")
      .replace("and", "和")
      .replace("for", "以获得")
      .replace("emphasis", "强调");

    const unmasked = unmaskEpubInlineElements(simulatedTranslated, masks);
    expect(unmasked).toContain('<sup class="fn"><a href="#fn1">[1]</a></sup>');
    expect(unmasked).toContain('<img src="icon.png" alt="star"/>');
    expect(unmasked).toContain("请参见注脚");
  });

  test("双语行内插入模式应用", () => {
    const xhtml = `<html><body><p>Hello world.</p></body></html>`;
    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    expect(units.length).toBe(1);
    units[0].targetHtml = "你好，世界。";

    applyTranslationToDoc(units, "bilingual", "style_test");

    const p = doc.querySelector("p");
    expect(p.innerHTML).toBe(
      'Hello world.<br class="kt-bilingual-br"/><span class="kt-bilingual-target style_test">你好，世界。</span>'
    );
  });

  test("纯译文模式应用", () => {
    const xhtml = `<html><body><p>Original content.</p></body></html>`;
    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    units[0].targetHtml = "替换后的译文内容。";
    applyTranslationToDoc(units, "target");

    const p = doc.querySelector("p");
    expect(p.innerHTML).toBe("替换后的译文内容。");
  });

  test("双语写回容错：处理翻译接口返回的非法 XML（未转义 &、未闭合标签、&nbsp; 实体等），杜绝 invalid XML 崩溃", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Harper &amp; Brothers published this.</p>
      </body>
    </html>`;
    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    expect(units.length).toBe(1);
    // 模拟翻译接口返回了未经 XML 转义的裸 &、裸 < 以及未闭合的 <em> 标签
    units[0].targetHtml =
      "哈珀 & 兄弟公司出版了本书。<em>未闭合斜体 带有 <角括号> 与 &nbsp; 实体";

    expect(() => {
      applyTranslationToDoc(units, "bilingual", "style_test");
    }).not.toThrow();

    const p = doc.querySelector("p");
    expect(p.textContent).toContain("哈珀 & 兄弟公司出版了本书");
    expect(p.querySelector(".kt-bilingual-target")).toBeTruthy();

    // 验证序列化后依然保持严格 XML 合规
    const resultXhtml = serializeDocToXhtml(doc);
    expect(resultXhtml).toMatch(/^<\?xml version="1\.0"/);
    expect(resultXhtml).toContain("&amp;");
    expect(resultXhtml).not.toContain("&nbsp;");
  });

  test("XML 序列化与非法实体修复", () => {
    const xhtml = `<html><body><p>Hello&nbsp;World</p></body></html>`;
    const doc = parseXhtmlToDoc(xhtml);
    const resultXhtml = serializeDocToXhtml(doc);

    expect(resultXhtml).toMatch(/^<\?xml version="1\.0"/);
    expect(resultXhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    // &nbsp; 应被转成合法的 &#160;
    expect(resultXhtml).not.toContain("&nbsp;");
    expect(resultXhtml).toContain("&#160;");
  });

  test("古登堡 Project Gutenberg 风格嵌套 <div> 容器正文自动识别与翻译", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <footer class="pg-footer">
          <div class="pg-boilerplate">
            <div>1.E.2. If an individual Project Gutenberg electronic work is derived...</div>
            <div>1.E.3. If an individual Project Gutenberg electronic work is posted...</div>
          </div>
        </footer>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 外层 footer 与 div.pg-boilerplate 应被视为结构容器下钻，只有内层包含正文的 2 个 div 被提取为叶子块
    expect(units.length).toBe(2);
    expect(units[0].element.tagName.toUpperCase()).toBe("DIV");
    expect(units[0].rawHtml).toContain("1.E.2.");
    expect(units[1].element.tagName.toUpperCase()).toBe("DIV");
    expect(units[1].rawHtml).toContain("1.E.3.");

    units[0].targetHtml = "1.E.2. 如果个人古登堡项目电子作品源于...";
    units[1].targetHtml = "1.E.3. 如果个人古登堡项目电子作品发布于...";
    applyTranslationToDoc(units, "bilingual", "style_test");

    const target1 = units[0].element.querySelector(".kt-bilingual-target");
    const target2 = units[1].element.querySelector(".kt-bilingual-target");
    expect(target1).not.toBeNull();
    expect(target1.textContent).toBe(
      "1.E.2. 如果个人古登堡项目电子作品源于..."
    );
    expect(target1.className).toContain("style_test");
    expect(target2).not.toBeNull();
    expect(target2.textContent).toBe(
      "1.E.3. 如果个人古登堡项目电子作品发布于..."
    );
  });

  test("<br> 换行逐行切分与逐行双语对照", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Line 1 of poem<br/>Line 2 of poem<br/>Line 3 of poem</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 应该切分成 3 个独立的行级翻译单元
    expect(units.length).toBe(3);
    expect(units[0].rawHtml).toBe("Line 1 of poem");
    expect(units[1].rawHtml).toBe("Line 2 of poem");
    expect(units[2].rawHtml).toBe("Line 3 of poem");

    units[0].targetHtml = "诗歌第一行";
    units[1].targetHtml = "诗歌第二行";
    units[2].targetHtml = "诗歌第三行";

    applyTranslationToDoc(units, "bilingual");

    const p = doc.querySelector("p");
    const brTags = p.querySelectorAll("br");
    // 原有 2 个换行 + 3 个双语 br，共 5 个 br
    expect(brTags.length).toBe(5);

    // 验证每行通过 .kt-line-unit 包裹并紧跟自身译文
    const lineUnits = p.querySelectorAll(".kt-line-unit");
    expect(lineUnits.length).toBe(3);
    expect(lineUnits[0].textContent).toContain("Line 1 of poem");
    expect(lineUnits[0].querySelector(".kt-bilingual-target").textContent).toBe(
      "诗歌第一行"
    );
    expect(lineUnits[1].textContent).toContain("Line 2 of poem");
    expect(lineUnits[1].querySelector(".kt-bilingual-target").textContent).toBe(
      "诗歌第二行"
    );
    expect(lineUnits[2].textContent).toContain("Line 3 of poem");
    expect(lineUnits[2].querySelector(".kt-bilingual-target").textContent).toBe(
      "诗歌第三行"
    );
  });

  test("连续 <br/><br/> 诗歌空行与空白段落保持", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Stanza 1 line 1<br/>Stanza 1 line 2<br/><br/>Stanza 2 line 1</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 只有 3 行有文字，连续 <br/><br/> 之间没有文字，不产生多余单元
    expect(units.length).toBe(3);
    expect(units[0].rawHtml).toBe("Stanza 1 line 1");
    expect(units[1].rawHtml).toBe("Stanza 1 line 2");
    expect(units[2].rawHtml).toBe("Stanza 2 line 1");
  });

  test("混合内容 Mixed Content 直接文本自动包裹独立翻译", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <div class="note">
          Notice: This is important notice text.
          <p>Inner clause text.</p>
        </div>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 外层的直接文本被动态包裹为独立的 .kt-text-leaf，与内部的 p 分别提取，互不冲突
    expect(units.length).toBe(2);
    expect(units[0].element.classList.contains("kt-text-leaf")).toBe(true);
    expect(units[0].rawHtml).toContain(
      "Notice: This is important notice text."
    );
    expect(units[1].element.tagName.toUpperCase()).toBe("P");
    expect(units[1].rawHtml).toBe("Inner clause text.");

    units[0].targetHtml = "提示：这是重要提示文本。";
    units[1].targetHtml = "内部条款文本。";
    applyTranslationToDoc(units, "bilingual");

    expect(units[0].element.innerHTML).toContain("提示：这是重要提示文本。");
    expect(units[1].element.innerHTML).toContain("内部条款文本。");
  });

  test("标准忽略属性与标签（translate=no, notranslate, pagebreak）过滤", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <div translate="no">Do not translate this</div>
        <p class="notranslate">Skip this paragraph</p>
        <span epub:type="pagebreak" id="p1">Page 1</span>
        <p>Normal translatable paragraph.</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);

    // 只有 Normal translatable paragraph. 被提取
    expect(units.length).toBe(1);
    expect(units[0].rawHtml).toBe("Normal translatable paragraph.");
  });

  test("healEpubPagebreaks 跨页印刷断词缝合与排版页码元数据剔除", () => {
    // 1. 连字符断词跨页情况 (ter- + ebookmaker-pageno + rific -> terrific)
    const brokenWithHyphen =
      'It was ter-<span class="ebookmaker-pageno" title="[17]" id="pgepubid00020"><a id="page_17"></a></span>rific news!';
    const healed1 = healEpubPagebreaks(brokenWithHyphen);
    expect(healed1).toBe("It was terrific news!");

    // 2. 无连字符但被页码标签切断情况 (ter + ebookmaker-pageno + rific -> terrific)
    const brokenWithoutHyphen =
      'It was ter<span class="ebookmaker-pageno" title="[17]"><a id="page_17"></a></span>rific news!';
    const healed2 = healEpubPagebreaks(brokenWithoutHyphen);
    expect(healed2).toBe("It was terrific news!");

    // 3. 正常跨页非断词（句子间页码，自动替换为空格，避免粘连）
    const normalPagebreak =
      'End of sentence.<span class="ebookmaker-pageno" title="[18]"><a id="page_18"></a></span>Start of next.';
    const healed3 = healEpubPagebreaks(normalPagebreak);
    expect(healed3).toBe("End of sentence. Start of next.");
  });

  test("成对富文本标签语义化保护（杜绝专有名词被双下划线截断碎裂）与纯文本模式", () => {
    const rawHtml =
      'Read <i>The Boston Evening Transcript</i> today for <a href="news.html">details</a>.';

    // 1. 默认保留富文本：成对使用 <t0>...</t0>
    const richResult = maskEpubInlineElements(rawHtml, "true");
    expect(richResult.masked).toContain(
      "<t0>The Boston Evening Transcript</t0>"
    );
    expect(richResult.masked).toContain("<t1>details</t1>");
    expect(richResult.masked).not.toContain("__KTTAG_");

    // 模拟翻译引擎将整体短语翻译为中文书名号
    const translatedRich = richResult.masked
      .replace("Read", "阅读")
      .replace(
        "<t0>The Boston Evening Transcript</t0>",
        "<t0>《波士顿晚报》</t0>"
      )
      .replace("today for", "以了解")
      .replace("<t1>details</t1>", "<t1>详情</t1>");

    const unmasked = unmaskEpubInlineElements(translatedRich, richResult.masks);
    expect(unmasked).toContain("<i>《波士顿晚报》</i>");
    expect(unmasked).toContain('<a href="news.html">详情</a>');

    // 2. 禁用富文本（纯净文本模式）：忽略内联标签，直接提取纯文本
    const plainResult = maskEpubInlineElements(rawHtml, "false");
    expect(plainResult.masked).toBe(
      "Read The Boston Evening Transcript today for details."
    );
    expect(plainResult.masks.tagMap.size).toBe(0);
  });

  test("extractTranslatableUnits 透传 hasRichText 选项生效验证", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>The <b>Black Cat</b> appeared.</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);

    // 模式 A：默认保留富文本
    const richUnits = extractTranslatableUnits(doc, { hasRichText: "true" });
    expect(richUnits[0].maskedText).toBe("The <t0>Black Cat</t0> appeared.");

    // 模式 B：纯净文本
    const plainUnits = extractTranslatableUnits(doc, { hasRichText: "false" });
    expect(plainUnits[0].maskedText).toBe("The Black Cat appeared.");
  });

  test("resolveEpubImages 成功将相对路径图片与 SVG image 映射为 Blob URL", () => {
    // 模拟 URL.createObjectURL
    const originalCreate = global.URL.createObjectURL;
    let urlCounter = 0;
    global.URL.createObjectURL = jest.fn(
      () => `blob:http://localhost/mock-uuid-${++urlCounter}`
    );

    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="images/cover.jpg" alt="Cover" />
        <img src="https://example.com/external.png" alt="External" />
        <svg>
          <image xlink:href="../shared/diagram.svg" width="100" height="100" />
        </svg>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const filesMap = {
      "OEBPS/images/cover.jpg": new Uint8Array([1, 2, 3]),
      "shared/diagram.svg": new Uint8Array([4, 5, 6]),
    };

    const createdUrls = resolveEpubImages(
      doc,
      "OEBPS/chapter1.xhtml",
      filesMap
    );

    expect(createdUrls.length).toBe(2);
    expect(doc.querySelector('img[alt="Cover"]').getAttribute("src")).toBe(
      "blob:http://localhost/mock-uuid-1"
    );
    expect(doc.querySelector('img[alt="External"]').hasAttribute("src")).toBe(
      false
    );
    expect(doc.querySelector("image").getAttribute("href")).toBe(
      "blob:http://localhost/mock-uuid-2"
    );

    if (originalCreate) {
      global.URL.createObjectURL = originalCreate;
    }
  });

  test("导出写回恶意 HTML/XSS 净化：拦截 onerror 与 script（修复问题 1）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Original Text</p>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const units = extractTranslatableUnits(doc);
    expect(units.length).toBe(1);

    // 模拟翻译接口返回携带 onerror 与 script 的恶意 HTML
    units[0].targetHtml =
      'Translated <img src="x" onerror="alert(1)" /><script>alert(2)</script>';
    applyTranslationToDoc(units, "target");

    const exportedXhtml = serializeDocToXhtml(doc);
    expect(exportedXhtml).not.toContain("onerror");
    expect(exportedXhtml).not.toContain("<script>");
    expect(exportedXhtml).not.toContain("alert");
    expect(exportedXhtml).toContain("<img");
  });

  test("MathML 与 SVG 行内公式/矢量图保护与还原（修复问题 3）", () => {
    const rawHtml =
      'A <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> B and <svg><circle cx="5" cy="5" r="5"/></svg> C';
    const { masked, masks } = maskEpubInlineElements(rawHtml, "true");

    expect(masked).toMatch(/A \{\{KTOBJ_\d+\}\} B and \{\{KTOBJ_\d+\}\} C/);
    expect(masks.placeholderMap.size).toBe(2);

    // 模拟翻译服务保留占位符
    const translated = masked.replace("and", "与");
    const unmasked = unmaskEpubInlineElements(translated, masks);

    expect(unmasked).toContain(
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
    );
    expect(unmasked).toMatch(
      /<svg><circle cx="5" cy="5" r="5"(><\/circle>|\/>)<\/svg>/
    );
    expect(unmasked).toContain("与");
  });

  test("纯净文本模式图片占位符还原映射测试（修复问题 4）", () => {
    const rawHtml =
      '<p>Illustration <img src="fig1.png" alt="figure 1" /> in text.</p>';
    const { masked, masks } = maskEpubInlineElements(rawHtml, "false");

    expect(masked).toContain("{{KTIMG_0}}");
    expect(masks.placeholderMap.size).toBe(1);

    // 模拟翻译
    const translated = masked
      .replace("Illustration", "插图")
      .replace("in text.", "在正文中。");
    const unmasked = unmaskEpubInlineElements(translated, masks);

    expect(unmasked).not.toContain("{{KTIMG_0}}");
    expect(unmasked).toContain('<img src="fig1.png" alt="figure 1" />');
    expect(unmasked).toContain("插图");
  });

  test("行内 translate=no 与 notranslate 专有标记保护测试（修复问题 5）", () => {
    const rawHtml =
      'Welcome to <span translate="no">Apple Inc.</span> and <span class="notranslate">OpenAI</span> products.';
    const { masked, masks } = maskEpubInlineElements(rawHtml, "true");

    expect(masked).not.toContain("Apple Inc.");
    expect(masked).not.toContain("OpenAI");
    expect(masked).toMatch(
      /Welcome to \{\{KTRAW_\d+\}\} and \{\{KTRAW_\d+\}\} products\./
    );

    const translated = masked
      .replace("Welcome to", "欢迎使用")
      .replace("and", "和")
      .replace("products.", "产品。");
    const unmasked = unmaskEpubInlineElements(translated, masks);

    expect(unmasked).toContain('<span translate="no">Apple Inc.</span>');
    expect(unmasked).toContain('<span class="notranslate">OpenAI</span>');
    expect(unmasked).toContain("欢迎使用");
  });

  test("embedEpubImagesAsDataUrls 将相对图片转化为 Base64 Data URL（修复问题 9 辅助）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img src="images/photo.jpg" alt="Photo" />
        <svg><image xlink:href="images/diagram.png" width="50" height="50" /></svg>
      </body>
    </html>`;

    const doc = parseXhtmlToDoc(xhtml);
    const filesMap = {
      "OEBPS/images/photo.jpg": new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      "OEBPS/images/diagram.png": new Uint8Array([87, 111, 114, 108, 100]), // "World"
    };

    embedEpubImagesAsDataUrls(doc, "OEBPS/chapter1.xhtml", filesMap);

    const img = doc.querySelector("img");
    expect(img.getAttribute("src")).toMatch(/^data:image\/jpeg;base64,/);

    const svgImg = doc.querySelector("image");
    expect(svgImg.getAttribute("href")).toMatch(/^data:image\/png;base64,/);
  });

  test("纯文本模式下 translate=no、notranslate 与 MathML/SVG 依然受保护并不被送入翻译（第二轮修复问题 4）", () => {
    const rawHtml =
      '<p>Visit <span translate="no">Google DeepMind</span> and <b class="notranslate">Gemini</b> to see <math><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math> formula.</p>';
    // 纯文本模式：keepRich = false
    const { masked, masks } = maskEpubInlineElements(rawHtml, false);

    // 专有名词和公式不应作为裸纯文本出现
    expect(masked).not.toContain("Google DeepMind");
    expect(masked).not.toContain("Gemini");
    expect(masked).not.toContain("mc2");
    expect(masked).toContain("{{KTRAW_");
    expect(masked).toContain("{{KTOBJ_");

    // 模拟翻译服务返回
    const translated = masked
      .replace("Visit", "访问")
      .replace("and", "与")
      .replace("to see", "以查看")
      .replace("formula.", "公式。");

    const unmasked = unmaskEpubInlineElements(translated, masks);
    expect(unmasked).toContain('<span translate="no">Google DeepMind</span>');
    expect(unmasked).toContain('<b class="notranslate">Gemini</b>');
    expect(unmasked).toContain(
      "<math><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>"
    );
    expect(unmasked).toContain("访问");
  });

  test("图片标签属性包含 > 字符时不被提前截断，完整捕获并无损还原（第三轮修复问题 4）", () => {
    const rawHtml =
      '<p>Figure: <img alt="Condition 1 > 0" src="fig.png" title="a > b & c < d" /> - end.</p>';
    const { masked, masks } = maskEpubInlineElements(rawHtml, "true");

    // 验证占位符没有在引号内的 > 提前截断，没有裸露残留的属性片段
    expect(masked).not.toContain('0" src="fig.png"');
    expect(masked).not.toContain('b & c < d"');
    expect(masked).toContain("{{KTIMG_0}}");
    expect(masked).toBe("Figure: {{KTIMG_0}} - end.");

    // 验证翻译后反掩码能 100% 完整复原原始图片标签
    const translated = masked
      .replace("Figure:", "配图:")
      .replace("- end.", "- 结束。");
    const unmasked = unmaskEpubInlineElements(translated, masks);
    expect(unmasked).toContain(
      '<img alt="Condition 1 > 0" src="fig.png" title="a > b & c < d" />'
    );
    expect(unmasked).toContain("配图:");
    expect(unmasked).toContain("- 结束。");
  });

  test("行内代码在富文本与纯文本模式下均受保护不送翻，且纯译文导出完整还原（第四轮问题 1）", () => {
    const rawHtml = "Hello <code>npm install</code> world";

    // 1. 富文本模式：code 节点被保护为占位符，不丢弃，不送翻代码本身
    const richRes = maskEpubInlineElements(rawHtml, true);
    expect(richRes.masked).not.toContain("npm install");
    expect(richRes.masked).toContain("{{KTRAW_0}}");
    const richTranslated = richRes.masked
      .replace("Hello", "你好")
      .replace("world", "世界");
    const richUnmasked = unmaskEpubInlineElements(
      richTranslated,
      richRes.masks
    );
    expect(richUnmasked).toBe("你好 <code>npm install</code> 世界");

    // 验证导出纯译文时，段落包含 npm install
    const doc = parseXhtmlToDoc(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello <code>npm install</code> world</p></body></html>'
    );
    const units = extractTranslatableUnits(doc, { hasRichText: "true" });
    units[0].targetHtml = richUnmasked;
    applyTranslationToDoc(units, "target");
    expect(doc.body.innerHTML).toContain("<code>npm install</code>");
    expect(doc.body.innerHTML).toContain("npm install");

    // 2. 纯文本模式：code 节点同样受保护为占位符，不将代码内容裸露送翻
    const plainRes = maskEpubInlineElements(rawHtml, false);
    expect(plainRes.masked).not.toContain("npm install");
    expect(plainRes.masked).toContain("{{KTRAW_0}}");
    const plainTranslated = plainRes.masked
      .replace("Hello", "你好")
      .replace("world", "世界");
    const plainUnmasked = unmaskEpubInlineElements(
      plainTranslated,
      plainRes.masks
    );
    expect(plainUnmasked).toBe("你好 <code>npm install</code> 世界");

    // 3. 验证行内 script 标签在两种模式下均不提取其文本内容
    const scriptHtml =
      '<p>Normal text <script>alert("evil")</script> and tail.</p>';
    const richScript = maskEpubInlineElements(scriptHtml, true);
    expect(richScript.masked).not.toContain("alert");
    expect(richScript.masked).not.toContain("evil");

    const plainScript = maskEpubInlineElements(scriptHtml, false);
    expect(plainScript.masked).not.toContain("alert");
    expect(plainScript.masked).not.toContain("evil");
  });

  test("容错回写保留解析所得的 MathML 与 SVG 命名空间（第四轮问题 2）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p id="target-p">Placeholder</p>
      </body>
    </html>`;
    const doc = parseXhtmlToDoc(xhtml);
    const p = doc.getElementById("target-p");

    // 含有未转义的 &（强制触发 HTML 容错回退解析），同时包含 SVG 和 MathML
    const faultyMarkup =
      'Tom & Jerry formula: <math><mi>x</mi><mo>+</mo><mn>1</mn></math> and vector: <svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>';
    setSafeXmlInnerHtml(p, faultyMarkup);

    // 验证未转义 & 容错解析成功，文本节点存在
    expect(p.textContent).toContain("Tom & Jerry");

    // 验证 SVG 及其子元素保留 SVG 命名空间
    const svg = p.querySelector("svg");
    const circle = p.querySelector("circle");
    expect(svg).not.toBeNull();
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle).not.toBeNull();
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");

    // 验证 MathML 及其子元素保留 MathML 命名空间
    const math = p.querySelector("math");
    const mi = p.querySelector("mi");
    expect(math).not.toBeNull();
    expect(math.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(mi).not.toBeNull();
    expect(mi.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
  });

  test("图片解析与单章内嵌导出阻断远程资源引用与外部背景图（第四轮问题 4）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img id="remote-img" src="https://tracker.example.com/pixel.png" alt="tracker" />
        <svg><image id="remote-svg" xlink:href="http://tracker.example.com/logo.svg" /></svg>
        <div id="remote-bg" style="color: red; background-image: url('https://tracker.example.com/bg.png');">Content</div>
      </body>
    </html>`;
    const doc = parseXhtmlToDoc(xhtml);

    resolveEpubImages(doc, "OEBPS/ch1.xhtml", {});

    const img = doc.getElementById("remote-img");
    expect(img.hasAttribute("src")).toBe(false);

    const svgImg = doc.getElementById("remote-svg");
    expect(svgImg.hasAttribute("xlink:href")).toBe(false);
    expect(svgImg.hasAttribute("href")).toBe(false);

    const div = doc.getElementById("remote-bg");
    expect(div.getAttribute("style")).not.toContain("https://");
    expect(div.getAttribute("style")).toContain("background-image: none");

    // 单章 Base64 内嵌导出同样验证阻断
    const doc2 = parseXhtmlToDoc(xhtml);
    embedEpubImagesAsDataUrls(doc2, "OEBPS/ch1.xhtml", {});
    expect(doc2.getElementById("remote-img").hasAttribute("src")).toBe(false);
    expect(doc2.getElementById("remote-svg").hasAttribute("xlink:href")).toBe(
      false
    );
    expect(
      doc2.getElementById("remote-bg").getAttribute("style")
    ).not.toContain("https://");
  });

  test("图片解析与单章内嵌导出严格阻断远程 srcset 与 source 标签（第五轮问题 1）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <picture>
          <source id="remote-source" srcset="https://tracker.com/1.webp 1x, https://tracker.com/2.webp 2x" />
          <img id="remote-img-srcset" src="https://tracker.com/img.jpg" srcset="https://tracker.com/img1.jpg 1x, https://tracker.com/img2.jpg 2x" alt="img" />
        </picture>
      </body>
    </html>`;
    const doc = parseXhtmlToDoc(xhtml);
    resolveEpubImages(doc, "OEBPS/ch1.xhtml", {});

    const source = doc.getElementById("remote-source");
    expect(source.hasAttribute("srcset")).toBe(false);

    const img = doc.getElementById("remote-img-srcset");
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("src")).toBe(false);

    // 单章内嵌导出同样阻断
    const doc2 = parseXhtmlToDoc(xhtml);
    embedEpubImagesAsDataUrls(doc2, "OEBPS/ch1.xhtml", {});
    expect(doc2.getElementById("remote-source").hasAttribute("srcset")).toBe(
      false
    );
    expect(
      doc2.getElementById("remote-img-srcset").hasAttribute("srcset")
    ).toBe(false);
    expect(doc2.getElementById("remote-img-srcset").hasAttribute("src")).toBe(
      false
    );
  });

  test("大小写不敏感阻断远程图片与 video poster，并在 sanitizeEpubMarkup 中彻底剥离（第六轮问题 2）", () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <img id="upper-img" src="HTTP://example.com/photo.jpg" />
        <svg><image id="upper-svg" xlink:href="HTTPS://example.com/logo.svg" /></svg>
        <video id="upper-video" poster="HTTPS://example.com/poster.jpg" src="HTTP://example.com/video.mp4" />
        <audio id="upper-audio" src="HTTP://example.com/sound.mp3" />
        <a id="external-link" href="https://example.com/about">关于页面</a>
      </body>
    </html>`;

    // 1. 测试 embedEpubImagesAsDataUrls
    const doc1 = parseXhtmlToDoc(xhtml);
    embedEpubImagesAsDataUrls(doc1, "OEBPS/ch1.xhtml", {});
    expect(doc1.getElementById("upper-img").hasAttribute("src")).toBe(false);
    expect(doc1.getElementById("upper-svg").hasAttribute("xlink:href")).toBe(
      false
    );
    expect(doc1.getElementById("upper-video").hasAttribute("poster")).toBe(
      false
    );
    expect(doc1.getElementById("upper-video").hasAttribute("src")).toBe(false);
    expect(doc1.getElementById("upper-audio").hasAttribute("src")).toBe(false);

    // 2. 测试 resolveEpubImages
    const doc2 = parseXhtmlToDoc(xhtml);
    resolveEpubImages(doc2, "OEBPS/ch1.xhtml", {});
    expect(doc2.getElementById("upper-img").hasAttribute("src")).toBe(false);
    expect(doc2.getElementById("upper-svg").hasAttribute("xlink:href")).toBe(
      false
    );
    expect(doc2.getElementById("upper-video").hasAttribute("poster")).toBe(
      false
    );
    expect(doc2.getElementById("upper-video").hasAttribute("src")).toBe(false);
    expect(doc2.getElementById("upper-audio").hasAttribute("src")).toBe(false);

    // 3. 测试 sanitizeEpubMarkup：即便原始 markup 绕过了内嵌处理，DOMPurify 净化也会剥离大写 HTTP:// 图片与 HTTPS poster，并保留外部 a 链接
    const rawMarkup = `<div>
      <img src="HTTP://example.com/tracker.png" alt="tracker" />
      <video poster="HTTPS://example.com/preview.jpg" src="https://example.com/stream.mp4"></video>
      <div style="background-image: url('HTTP://example.com/bg.png')">Text</div>
      <a href="https://example.com/doc">文档链接</a>
    </div>`;
    const cleanMarkup = sanitizeEpubMarkup(rawMarkup);
    expect(cleanMarkup).not.toContain("HTTP://example.com/tracker.png");
    expect(cleanMarkup).not.toContain("HTTPS://example.com/preview.jpg");
    expect(cleanMarkup).not.toContain("https://example.com/stream.mp4");
    expect(cleanMarkup).not.toContain("url('HTTP://example.com/bg.png')");
    expect(cleanMarkup).toContain("none");
    expect(cleanMarkup).toContain('href="https://example.com/doc"');
  });

  test("防范通过 CSS 反斜杠转义绕过远程资源过滤（第七轮问题 2）", () => {
    // 1. 验证 cssUnescape 标准还原能力
    expect(cssUnescape("\\68ttps://example.com")).toBe("https://example.com");
    expect(cssUnescape("\\68 ttps://example.com")).toBe("https://example.com");
    expect(cssUnescape("\\000068ttps://example.com")).toBe(
      "https://example.com"
    );
    expect(cssUnescape("\\2f\\2f example.com")).toBe("//example.com");
    expect(cssUnescape("\\h\\t\\t\\p\\s\\:\\/\\/example.com")).toBe(
      "https://example.com"
    );

    // 2. 验证 cleanCssRemoteUrls 清洗转义 URL token
    expect(
      cleanCssRemoteUrls(
        "background-image:url(\\68ttps://example.com/track.png)"
      )
    ).toBe("background-image:none");
    expect(
      cleanCssRemoteUrls(
        "background-image:url(\\68 ttps://example.com/track.png)"
      )
    ).toBe("background-image:none");
    expect(
      cleanCssRemoteUrls(
        "background-image:url(\\000068ttps://example.com/track.png)"
      )
    ).toBe("background-image:none");
    expect(
      cleanCssRemoteUrls(
        "background-image:url('\\h\\t\\t\\p\\s\\:\\/\\/example.com/track.png')"
      )
    ).toBe("background-image:none");
    expect(
      cleanCssRemoteUrls("background: \\75rl(https://example.com/track.png)")
    ).toBe("background: none");

    // 本地与 Base64 资源绝不误杀
    expect(
      cleanCssRemoteUrls("background: url(data:image/png;base64,iVBORw0KGgo=)")
    ).toBe("background: url(data:image/png;base64,iVBORw0KGgo=)");
    expect(cleanCssRemoteUrls("background: url('images/bg.png')")).toBe(
      "background: url('images/bg.png')"
    );

    // 3. 验证 sanitizeEpubMarkup 对转义样式的深度清洗
    const escapedHtml = `<div style="background-image:url(\\68ttps://example.com/track.png); color: red;">
      <p style="background: url('\\000068ttps://example.com/p.png')">Hello</p>
      <style>
        .banner { background-image: url(\\68 ttps://example.com/banner.jpg); }
      </style>
    </div>`;
    const cleanedHtml = sanitizeEpubMarkup(escapedHtml);
    expect(cleanedHtml).not.toContain("track.png");
    expect(cleanedHtml).not.toContain("p.png");
    expect(cleanedHtml).not.toContain("banner.jpg");
    expect(cleanedHtml).toContain("none");
    expect(cleanedHtml).toContain("color: red;");

    // 4. 验证 embedEpubImagesAsDataUrls 与 resolveEpubImages 对转义样式的清洗
    const doc = parseXhtmlToDoc(`<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <div id="test-escaped" style="background-image:url(\\68ttps://example.com/track.png)">Content</div>
      </body>
    </html>`);
    embedEpubImagesAsDataUrls(doc, "OEBPS/ch1.xhtml", {});
    expect(doc.getElementById("test-escaped").getAttribute("style")).toBe(
      "background-image:none"
    );
  });

  test("body 下直接行内文本与行内标签自动识别并完整翻译回写（第八轮问题 2）", () => {
    // 1. 验证 <body><span>Hello</span></body> 能够被提取为有效单元
    const xhtml1 = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body><span>Hello inline</span></body>
    </html>`;
    const doc1 = parseXhtmlToDoc(xhtml1);
    const units1 = extractTranslatableUnits(doc1);
    expect(units1.length).toBe(1);
    expect(units1[0].rawHtml).toContain("Hello inline");

    // 双语与仅译文回写验证
    units1[0].targetHtml = "<span>你好行内</span>";
    applyTranslationToDoc(units1, "bilingual");
    expect(doc1.body.innerHTML).toContain("Hello inline");
    expect(doc1.body.innerHTML).toContain("你好行内");

    // 2. 验证 body 下混合行内元素与文本：<body>Hello <em>world</em></body>
    const xhtml2 = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>Hello <em>world</em></body>
    </html>`;
    const doc2 = parseXhtmlToDoc(xhtml2);
    const units2 = extractTranslatableUnits(doc2);
    expect(units2.length).toBe(1);
    expect(units2[0].rawHtml).toContain("Hello");
    expect(units2[0].rawHtml).toContain("<em");
    expect(units2[0].rawHtml).toContain("world");

    // 3. 验证与块级元素混合排布：<body><p>Para 1</p><span>Span 1</span><p>Para 2</p></body>
    const xhtml3 = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <p>Para 1</p>
        <span>Span 1</span>
        <p>Para 2</p>
      </body>
    </html>`;
    const doc3 = parseXhtmlToDoc(xhtml3);
    const units3 = extractTranslatableUnits(doc3);
    expect(units3.length).toBe(3);
    expect(units3[0].rawHtml).toBe("Para 1");
    expect(units3[1].rawHtml).toContain("Span 1");
    expect(units3[2].rawHtml).toBe("Para 2");
  });
});
