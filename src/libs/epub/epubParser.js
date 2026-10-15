import * as fflate from "fflate";

/**
 * 规范化相对路径（消除 ./ 与 ../）
 * @param {string} path 原始路径
 * @returns {string} 规范化后的路径
 */
export function normalizePath(path) {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/");
  const result = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join("/");
}

/**
 * 安全 URL 解码函数，防止 URIError 导致解析中断
 * @param {string} uri 原始 URI 字符串
 * @returns {string} 解码后的字符串
 */
export function safeDecodeURI(uri) {
  if (!uri) return "";
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

/**
 * 解析 XML 字符串为 DOM 文档
 * @param {string} xmlString XML 字符串
 * @returns {Document} XML DOM
 */
export function parseXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    // 容错：尝试以 text/xml 或 text/html 解析
    const fallbackDoc = parser.parseFromString(xmlString, "text/xml");
    if (!fallbackDoc.querySelector("parsererror")) {
      return fallbackDoc;
    }
    throw new Error(`XML 解析失败: ${parserError.textContent.slice(0, 100)}`);
  }
  return doc;
}

/**
 * 安全获取标签内容（兼容带命名空间前缀与不带前缀的标签名）
 * @param {Element|Document} root 根节点
 * @param {string} localName 本地标签名，如 "title"
 * @param {string} [prefix] 命名空间前缀，如 "dc"
 * @returns {string} 标签文本内容
 */
export function getElementText(root, localName, prefix = "") {
  if (!root) return "";
  const candidates = [prefix ? `${prefix}:${localName}` : localName, localName];
  for (const tag of candidates) {
    const el = root.getElementsByTagName(tag)?.[0];
    if (el && el.textContent) {
      return el.textContent.trim();
    }
  }
  return "";
}

/**
 * 递归解析 EPUB 2 NCX 目录树（保留父子嵌套结构与锚点）
 * @param {Element} parentEl 父级元素（navMap 或上一级 navPoint）
 * @param {string} ncxDir NCX 文件所在基准目录
 * @returns {Array<Object>} 树形目录节点列表
 */
export function parseNcxNavPoints(parentEl, ncxDir) {
  const result = [];
  if (!parentEl) return result;
  const children = Array.from(parentEl.childNodes || []).filter(
    (n) =>
      n.nodeType === 1 &&
      (n.localName === "navPoint" || n.tagName?.toLowerCase() === "navpoint")
  );
  for (const np of children) {
    const id = np.getAttribute("id") || "";
    const navLabel = Array.from(np.childNodes || []).find(
      (n) =>
        n.nodeType === 1 &&
        (n.localName === "navLabel" || n.tagName?.toLowerCase() === "navlabel")
    );
    const textEl = navLabel?.getElementsByTagName
      ? navLabel.getElementsByTagName("text")?.[0]
      : Array.from(navLabel?.childNodes || []).find(
          (n) =>
            n.nodeType === 1 &&
            (n.localName === "text" || n.tagName?.toLowerCase() === "text")
        );
    const title = textEl?.textContent?.trim() || "";

    const contentEl = Array.from(np.childNodes || []).find(
      (n) =>
        n.nodeType === 1 &&
        (n.localName === "content" || n.tagName?.toLowerCase() === "content")
    );
    const src = contentEl?.getAttribute("src") || "";
    const subChildren = parseNcxNavPoints(np, ncxDir);

    if (title && src) {
      const [cleanSrc, rawHash = ""] = src.split("#");
      const fullPath = normalizePath(ncxDir + safeDecodeURI(cleanSrc));
      const hash = safeDecodeURI(rawHash);
      result.push({
        id: id || src,
        title,
        href: src,
        fullPath,
        hash,
        children: subChildren,
      });
    } else if (subChildren.length > 0) {
      result.push({
        id: id || `np-${result.length}`,
        title: title || "未命名小节",
        href: src || "",
        fullPath: subChildren[0].fullPath,
        hash: subChildren[0].hash,
        children: subChildren,
      });
    }
  }
  return result;
}

/**
 * 递归解析 EPUB 3 导航文档目录列表（ol > li 嵌套结构）
 * @param {Element} olEl 当前层级的 ol 元素
 * @param {string} navDir 导航文档所在基准目录
 * @returns {Array<Object>} 树形目录节点列表
 */
export function parseNavList(olEl, navDir) {
  const result = [];
  if (!olEl) return result;
  const lis = Array.from(olEl.childNodes || []).filter(
    (n) =>
      n.nodeType === 1 &&
      (n.localName === "li" || n.tagName?.toLowerCase() === "li")
  );
  for (const li of lis) {
    const a =
      Array.from(li.childNodes || []).find(
        (n) =>
          n.nodeType === 1 &&
          (n.localName === "a" || n.tagName?.toLowerCase() === "a")
      ) || li.querySelector?.("a");
    const text = a?.textContent?.trim() || "";
    const rawHref = a?.getAttribute("href") || "";
    const subOl =
      Array.from(li.childNodes || []).find(
        (n) =>
          n.nodeType === 1 &&
          (n.localName === "ol" || n.tagName?.toLowerCase() === "ol")
      ) || li.querySelector?.("ol");
    const subChildren = subOl ? parseNavList(subOl, navDir) : [];

    if (text && rawHref) {
      const [cleanHref, rawHash = ""] = rawHref.split("#");
      const fullPath = normalizePath(navDir + safeDecodeURI(cleanHref));
      const hash = safeDecodeURI(rawHash);
      result.push({
        id: a?.getAttribute("id") || rawHref,
        title: text,
        href: rawHref,
        fullPath,
        hash,
        children: subChildren,
      });
    } else if (subChildren.length > 0) {
      result.push({
        id: li.getAttribute?.("id") || `nav-${result.length}`,
        title: text || "未命名小节",
        href: "",
        fullPath: subChildren[0].fullPath,
        hash: subChildren[0].hash,
        children: subChildren,
      });
    }
  }
  return result;
}

/**
 * 扁平化目录树为一维列表（向后兼容）
 * @param {Array<Object>} nodes 目录树节点
 * @returns {Array<Object>} 扁平化目录列表
 */
export function flattenTocTree(nodes = []) {
  const list = [];
  for (const node of nodes) {
    list.push({
      id: node.id,
      title: node.title,
      href: node.href,
      fullPath: node.fullPath,
      hash: node.hash,
    });
    if (node.children && node.children.length > 0) {
      list.push(...flattenTocTree(node.children));
    }
  }
  return list;
}

/**
 * 校验 EPUB DRM 加密
 * 精准比对 META-INF/encryption.xml 中被加密的资源与 OPF manifest/spine：
 * 1. 过滤允许的字体反混淆（IDPF / Adobe Font Obfuscation 规范算法，或仅对字体文件的混淆）
 * 2. 精准识别正文加密（属于 spine 章节、或 manifest 中 media-type 为 xhtml/html/xml 的正文文档被加密）
 * 3. 避免文件名关键词误伤（如 fonts/chapter-font.otf 不被误报）与漏判（非标准命名的加密正文被精准拦截）
 * @param {Object} filesMap 文件映射表
 * @param {Map} manifestItems manifest 条目映射表
 * @param {Array} spineItems spine 章节数组
 */
export function checkEpubDrm(filesMap, manifestItems, spineItems) {
  const encryptionBytes = filesMap["META-INF/encryption.xml"];
  if (!encryptionBytes) return;

  const encDoc = parseXml(fflate.strFromU8(encryptionBytes));
  const elements = Array.from(
    encDoc.getElementsByTagName ? encDoc.getElementsByTagName("*") : []
  ).filter(
    (el) =>
      el.localName === "EncryptedData" || el.nodeName?.endsWith("EncryptedData")
  );

  if (elements.length === 0) return;

  const FONT_ALGORITHMS = new Set([
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
  ]);

  const spinePaths = new Set();
  (spineItems || []).forEach((item) => {
    if (item.fullPath) spinePaths.add(item.fullPath);
    if (item.rawPath) spinePaths.add(item.rawPath);
  });

  const pathToManifestItem = new Map();
  if (manifestItems) {
    for (const item of manifestItems.values()) {
      if (item.fullPath) pathToManifestItem.set(item.fullPath, item);
      if (item.rawPath) pathToManifestItem.set(item.rawPath, item);
    }
  }

  for (const encData of elements) {
    const allChildren = Array.from(
      encData.getElementsByTagName ? encData.getElementsByTagName("*") : []
    );
    const methodEl = allChildren.find(
      (el) =>
        el.localName === "EncryptionMethod" ||
        el.nodeName?.endsWith("EncryptionMethod")
    );
    const algorithm = (
      methodEl?.getAttribute("Algorithm") ||
      methodEl?.getAttribute("algorithm") ||
      ""
    ).trim();

    const cipherRef = allChildren.find(
      (el) =>
        el.localName === "CipherReference" ||
        el.nodeName?.endsWith("CipherReference")
    );
    const uri = (
      cipherRef?.getAttribute("URI") ||
      cipherRef?.getAttribute("uri") ||
      ""
    ).trim();

    if (!uri) continue;

    const cleanUri = uri.split("#")[0].split("?")[0];
    const decodedPath = normalizePath(safeDecodeURI(cleanUri));
    const rawPath = normalizePath(cleanUri);

    const isSpineFile = spinePaths.has(decodedPath) || spinePaths.has(rawPath);
    const manifestItem =
      pathToManifestItem.get(decodedPath) || pathToManifestItem.get(rawPath);
    const mediaType = (manifestItem?.mediaType || "").toLowerCase();

    const isTextDoc =
      isSpineFile ||
      mediaType === "application/xhtml+xml" ||
      mediaType === "text/html" ||
      mediaType === "application/x-dtbook+xml" ||
      mediaType === "text/xml";

    const isFontFile =
      mediaType.startsWith("font/") ||
      mediaType.includes("font") ||
      mediaType.includes("opentype") ||
      /\.(otf|ttf|woff|woff2)$/i.test(decodedPath);

    // 1. 若加密目标为正文文件（属于 spine 章节或 XHTML/HTML 文档），不论算法为何，正文均不可读，必须拦截
    if (isTextDoc) {
      throw new Error("该电子书受 DRM 加密保护，暂不支持翻译");
    }

    // 2. 若加密的不是字体，且算法不是已知的字体反混淆规范算法，则视为通用 DRM 加密
    if (!isFontFile && !FONT_ALGORITHMS.has(algorithm)) {
      throw new Error("该电子书受 DRM 加密保护，暂不支持翻译");
    }
  }
}

/**
 * 解析 EPUB 二进制数据
 * @param {ArrayBuffer|Uint8Array} buffer EPUB 文件二进制数据
 * @returns {Promise<Object>} EPUB 书籍信息结构体
 */
export async function parseEpubBook(buffer) {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 1. 解压 ZIP 归档
  let filesMap;
  try {
    filesMap = fflate.unzipSync(uint8);
  } catch (err) {
    throw new Error(
      `EPUB 文件解压失败，文件可能已损坏: ${err?.message || err}`
    );
  }

  // 2. 校验 mimetype 文件（必须包含 application/epub+zip）
  const mimetypeBytes = filesMap["mimetype"];
  if (mimetypeBytes) {
    const mimetypeStr = fflate.strFromU8(mimetypeBytes).trim();
    if (!mimetypeStr.includes("application/epub+zip")) {
      throw new Error("非法的 EPUB 文件: mimetype 不匹配");
    }
  }

  // 3. 定位 OPF 根包文件（读取 META-INF/container.xml）
  const containerBytes = filesMap["META-INF/container.xml"];
  if (!containerBytes) {
    throw new Error("无法读取 EPUB: 缺少 META-INF/container.xml");
  }
  const containerDoc = parseXml(fflate.strFromU8(containerBytes));
  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path");
  if (!opfPath || !filesMap[opfPath]) {
    throw new Error(`无法读取 EPUB: 找不到根包文件 (${opfPath || "未指定"})`);
  }

  // 计算 OPF 文件所在基准目录
  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // 5. 解析 OPF 包文档
  const opfDoc = parseXml(fflate.strFromU8(filesMap[opfPath]));
  const packageEl = opfDoc.querySelector("package") || opfDoc.documentElement;
  const version = packageEl.getAttribute("version") || "3.0";
  const isEpub3 = version.startsWith("3");

  // 检查固定版式 (Fixed-layout)
  const metaTags = opfDoc.querySelectorAll("meta");
  for (const meta of metaTags) {
    const prop = meta.getAttribute("property");
    const name = meta.getAttribute("name");
    const content = meta.getAttribute("content") || meta.textContent;
    if (
      (prop === "rendition:layout" || name === "rendition:layout") &&
      content?.trim() === "pre-paginated"
    ) {
      throw new Error(
        "该电子书为固定版式 (Fixed-layout)，首版仅支持可重排版式"
      );
    }
  }

  // 提取元数据
  const title = getElementText(opfDoc, "title", "dc") || "未命名书籍";
  const creator = getElementText(opfDoc, "creator", "dc") || "未知作者";
  const language = getElementText(opfDoc, "language", "dc") || "en";

  // 构建 Manifest 清单字典: id -> item
  const manifestItems = new Map();
  let navItemHref = "";
  let ncxItemHref = "";

  const itemEls = opfDoc.querySelectorAll("manifest > item");
  itemEls.forEach((el) => {
    const id = el.getAttribute("id");
    const href = el.getAttribute("href");
    const mediaType = el.getAttribute("media-type");
    const properties = el.getAttribute("properties") || "";
    if (id && href) {
      const cleanHref = href.split("#")[0].split("?")[0];
      const decodedHref = safeDecodeURI(cleanHref);
      const fullPath = normalizePath(opfDir + decodedHref);
      const rawPath = normalizePath(opfDir + cleanHref);
      const item = { id, href, fullPath, rawPath, mediaType, properties };
      manifestItems.set(id, item);

      // 寻找 EPUB 3 导航文档
      if (properties.split(/\s+/).includes("nav")) {
        navItemHref = filesMap[fullPath] ? fullPath : rawPath;
      }
      // 寻找 EPUB 2 NCX 文件
      if (mediaType === "application/x-dtbncx+xml") {
        ncxItemHref = filesMap[fullPath] ? fullPath : rawPath;
      }
    }
  });

  // 解析 Spine 阅读顺序
  const itemrefEls = opfDoc.querySelectorAll("spine > itemref");
  const spineItems = [];
  itemrefEls.forEach((el) => {
    const idref = el.getAttribute("idref");
    const manifestItem = manifestItems.get(idref);
    if (!manifestItem) return;
    const resolvedPath = filesMap[manifestItem.fullPath]
      ? manifestItem.fullPath
      : filesMap[manifestItem.rawPath]
        ? manifestItem.rawPath
        : null;
    if (resolvedPath) {
      spineItems.push({
        id: manifestItem.id,
        href: manifestItem.href,
        fullPath: resolvedPath,
        mediaType: manifestItem.mediaType,
      });
    }
  });

  // 校验 DRM 加密（检查 META-INF/encryption.xml，精准识别正文加密 vs 字体反混淆）
  checkEpubDrm(filesMap, manifestItems, spineItems);

  if (spineItems.length === 0) {
    throw new Error("EPUB 包文档的 spine 中未找到任何阅读章节");
  }

  // 6. 解析目录 (TOC)
  let tocTree = [];
  // 优先解析 EPUB 3 导航文档
  if (navItemHref && filesMap[navItemHref]) {
    try {
      const navDoc = parseXml(fflate.strFromU8(filesMap[navItemHref]));
      const tocNav =
        navDoc.querySelector('nav[epub\\:type="toc"]') ||
        navDoc.querySelector('nav[role="doc-toc"]') ||
        navDoc.querySelector("nav");
      if (tocNav) {
        const navDir = navItemHref.includes("/")
          ? navItemHref.slice(0, navItemHref.lastIndexOf("/") + 1)
          : "";
        const rootOl = tocNav.querySelector("ol");
        if (rootOl) {
          tocTree = parseNavList(rootOl, navDir);
        } else {
          // 兜底直接按链接解析
          const links = tocNav.querySelectorAll("a");
          links.forEach((a) => {
            const rawHref = a.getAttribute("href");
            const text = a.textContent?.trim();
            if (rawHref && text) {
              const [cleanHref, rawHash = ""] = rawHref.split("#");
              const fullPath = normalizePath(navDir + safeDecodeURI(cleanHref));
              const hash = safeDecodeURI(rawHash);
              tocTree.push({
                id: a.getAttribute("id") || rawHref,
                title: text,
                href: rawHref,
                fullPath,
                hash,
                children: [],
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn("解析 EPUB 3 导航文档失败，尝试回退 NCX:", e);
    }
  }

  // 回退解析 EPUB 2 NCX 目录
  if (tocTree.length === 0 && ncxItemHref && filesMap[ncxItemHref]) {
    try {
      const ncxDoc = parseXml(fflate.strFromU8(filesMap[ncxItemHref]));
      const navMap = ncxDoc.querySelector("navMap");
      const ncxDir = ncxItemHref.includes("/")
        ? ncxItemHref.slice(0, ncxItemHref.lastIndexOf("/") + 1)
        : "";
      if (navMap) {
        tocTree = parseNcxNavPoints(navMap, ncxDir);
      }
    } catch (e) {
      console.warn("解析 EPUB 2 NCX 失败:", e);
    }
  }

  // 若仍无目录，以 spineItems 默认章节序号兜底
  if (tocTree.length === 0) {
    tocTree = spineItems.map((item, idx) => ({
      id: `spine-${idx}`,
      title: `第 ${idx + 1} 节`,
      href: item.href,
      fullPath: item.fullPath,
      hash: "",
      children: [],
    }));
  }

  // 得到扁平化目录列表
  let tocItems = flattenTocTree(tocTree);

  // 为每个 spineItem 匹配最合适的标题（从 tocItems 中根据 fullPath 关联）
  spineItems.forEach((spine, index) => {
    const matched = tocItems.find((t) => t.fullPath === spine.fullPath);
    spine.title = matched ? matched.title : `第 ${index + 1} 节`;
  });

  // 7. 预估总字数（粗略统计纯文本字符数）
  let totalEstimatedWords = 0;
  for (const spine of spineItems) {
    const contentBytes = filesMap[spine.fullPath];
    if (contentBytes) {
      const htmlText = fflate.strFromU8(contentBytes);
      const textOnly = htmlText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      totalEstimatedWords += textOnly.trim().length;
    }
  }

  return {
    title,
    creator,
    language,
    version,
    isEpub3,
    opfPath,
    opfDir,
    navItemHref,
    ncxItemHref,
    filesMap,
    spineItems,
    tocTree,
    tocItems,
    totalEstimatedWords,
  };
}
