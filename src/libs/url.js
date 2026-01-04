/**
 * URL 處理工具函數
 */

/**
 * 檢查是否為 IP 位址 (v4 或 v6)
 * @param {string} hostname - 主機名稱
 * @returns {boolean}
 * @example
 * isIPAddress("192.168.1.1") -> true
 * isIPAddress("::1") -> true
 * isIPAddress("example.com") -> false
 */
export const isIPAddress = (hostname) => {
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIPv6 = hostname.includes(":");
  return isIPv4 || isIPv6;
};

/**
 * 中間截斷字串，保留頭尾
 * @param {string} str - 原始字串
 * @param {number} [maxLen=45] - 最大長度
 * @returns {string} 截斷後的字串
 * @example
 * truncateMiddle("short") -> "short"
 * truncateMiddle("/C:/Users/JohnDoe/Documents/Projects/article.txt", 30) -> "/C:/Users/Joh...cle/article.txt"
 */
export const truncateMiddle = (str, maxLen = 45) => {
  if (str.length <= maxLen) return str;
  const ellipsis = "...";
  const charsToShow = maxLen - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return `${str.slice(0, frontChars)}${ellipsis}${str.slice(-backChars)}`;
};

/**
 * 從 file:// URL 提取檔案匹配選項
 * @param {string} href - file:// URL
 * @returns {string[]} 匹配選項陣列，由精確到寬鬆排序
 * @example
 * "file:///C:/docs/article.txt" -> ["/C:/docs/article.txt", "/C:/docs/*", "*.txt", "article.txt"]
 * "file:///home/user/test.md" -> ["/home/user/test.md", "/home/user/*", "*.md", "test.md"]
 */
const getFileOptions = (href) => {
  const path = href.replace(/^file:\/\//, "");
  const filename = path.substring(path.lastIndexOf("/") + 1);
  const dir = path.substring(0, path.lastIndexOf("/"));
  const ext = filename.includes(".")
    ? filename.substring(filename.lastIndexOf("."))
    : "";

  const options = [];

  // 完整路徑（最精確）
  if (path) {
    try {
      options.push(decodeURIComponent(path));
    } catch {
      options.push(path);
    }
  }
  // 目錄萬用
  if (dir) {
    options.push(`${dir}/*`);
  }
  // 副檔名萬用
  if (ext) {
    options.push(`*${ext}`);
  }
  // 檔名（最寬鬆）
  if (filename && filename !== path) {
    try {
      options.push(decodeURIComponent(filename));
    } catch {
      options.push(filename);
    }
  }

  return options;
};

/**
 * 從 hostname 生成通配符選項
 * @param {string} hostname - 主機名稱
 * @returns {string[]} 匹配選項陣列，由精確到寬鬆排序
 * @example
 * "localhost" -> ["localhost"]
 * "example.com" -> ["example.com", "*.example.com"]
 * "foo.example.com" -> ["foo.example.com", "*.example.com"]
 * "bar.foo.example.com" -> ["bar.foo.example.com", "*.example.com", "*.*.example.com"]
 * "192.168.1.1" -> ["192.168.1.1"]
 */
const getWildcardOptions = (hostname) => {
  if (isIPAddress(hostname)) {
    return [hostname];
  }

  const parts = hostname.split(".");

  if (parts.length <= 1) {
    return [hostname];
  }

  if (parts.length === 2) {
    return [hostname, `*.${hostname}`];
  }

  const mainDomain = parts.slice(-2).join(".");
  const options = [hostname, `*.${mainDomain}`];

  for (let i = 1; i <= parts.length - 3; i++) {
    options.push(`${"*.".repeat(i + 1)}${mainDomain}`);
  }

  return options;
};

/**
 * 生成網域匹配選項
 * @param {string} href - 完整 URL
 * @returns {string[]} 可選的匹配模式陣列，由精確到寬鬆排序
 * @example
 * "https://example.com/page" -> ["example.com", "*.example.com"]
 * "http://localhost:3000/" -> ["localhost:3000", "localhost:*", "localhost"]
 * "http://192.168.1.1:8080/" -> ["192.168.1.1:8080", "192.168.1.1:*", "192.168.1.1"]
 * "https://foo.bar.example.com/" -> ["foo.bar.example.com", "*.example.com", "*.*.example.com"]
 * "http://dev.example.com:8080/" -> ["dev.example.com:8080", "dev.example.com:*", "dev.example.com", "*.example.com"]
 * "file:///C:/docs/article.txt" -> ["/C:/docs/article.txt", "/C:/docs/*", "*.txt", "article.txt"]
 * "chrome-extension://xxx/" -> []
 */
export const getDomainOptions = (href) => {
  if (!href || typeof href !== "string") {
    return [];
  }

  try {
    if (href.startsWith("file")) {
      return getFileOptions(href);
    }

    if (!href.startsWith("http")) {
      return [];
    }

    const url = new URL(href);
    const { hostname, port, protocol } = url;
    const defaultPort = protocol === "https:" ? "443" : "80";

    const wildcardOptions = getWildcardOptions(hostname);

    // 非預設 port 時，加入 port 相關選項
    if (port && port !== defaultPort) {
      const host = wildcardOptions[0];
      return [
        `${host}:${port}`,
        `${host}:*`,
        host,
        ...wildcardOptions.slice(1),
      ];
    }

    return wildcardOptions;
  } catch {
    return [];
  }
};
