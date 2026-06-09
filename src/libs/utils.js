/**
 * @file utils.js
 * @description 通用工具函数模块，包含类型判定、数字限制、字符串匹配、节流防抖、密码学加密等辅助方法。
 */

/**
 * 移除 Markdown 代码块标记（如 ```xml 译文 ```）
 * @param {string} text 原始文本
 * @param {boolean} startOnly 是否只处理开头
 * @returns {string} 移除代码块标记后的文本
 */
export function stripMarkdownCodeBlock(text, startOnly = false) {
  if (!text) return "";
  let result = text.replace(/^```[a-z]*\s*\n?/i, "");
  if (!startOnly) {
    result = result.replace(/\n?```$/i, "");
  }
  return result;
}

/**
 * 限制整数的边界范围
 * @param {*} num 输入值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number}
 */
export const limitNumber = (num, min = 0, max = 100) => {
  const number = parseInt(num);
  if (Number.isNaN(number) || number < min) {
    return min;
  } else if (number > max) {
    return max;
  }
  return number;
};

/**
 * 限制浮点数的边界范围
 * @param {*} num 输入值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number}
 */
export const limitFloat = (num, min = 0.0, max = 100.0) => {
  const number = parseFloat(num);
  if (Number.isNaN(number) || number < min) {
    return min;
  } else if (number > max) {
    return max;
  }
  return number;
};

/**
 * 匹配给定的值是否存在于数组中，如果存在则返回，否则返回数组的默认首项
 * @param {Array} arr 选项数组
 * @param {*} val 待匹配值
 * @returns {*}
 */
export const matchValue = (arr, val) => {
  if (arr.length === 0 || arr.includes(val)) {
    return val;
  }
  return arr[0];
};

/**
 * 异步等待（延迟）函数
 * @param {number} delay 延迟毫秒数
 * @returns {Promise<void>}
 */
export const sleep = (delay) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve();
    }, delay);
  });

/**
 * 函数防抖（Debounce）
 * @param {Function} func 目标执行函数
 * @param {number} delay 延迟触发时间（毫秒）
 * @returns {Function} 防抖包装后的新函数
 */
export const debounce = (func, delay = 200) => {
  let timer = null;

  const debouncedFunc = (...args) => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
      timer = null;
    }, delay);
  };

  // 提供手动取消未执行任务的方法
  debouncedFunc.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };

  return debouncedFunc;
};

/**
 * 函数节流（Throttle）
 * @param {Function} func 要执行的函数
 * @param {number} delay 节流周期时间（毫秒）
 * @param {object} options 选项配置：leading（是否首次即刻触发），trailing（周期结束后是否触发最近一次提交）
 * @returns {Function} 节流包装后的新函数
 */
export const throttle = (
  func,
  delay,
  options = { leading: true, trailing: true }
) => {
  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;
  let result;
  let previous = 0;

  function later() {
    previous = options.leading === false ? 0 : Date.now();
    timeoutId = null;
    result = func.apply(lastThis, lastArgs);
    if (!timeoutId) {
      lastThis = lastArgs = null;
    }
  }

  const throttled = function (...args) {
    const now = Date.now();
    if (!previous && options.leading === false) {
      previous = now;
    }

    const remaining = delay - (now - previous);
    lastArgs = args;
    lastThis = this;

    if (remaining <= 0 || remaining > delay) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      previous = now;
      result = func.apply(lastThis, lastArgs);
      if (!timeoutId) {
        lastThis = lastArgs = null;
      }
    } else if (!timeoutId && options.trailing !== false) {
      timeoutId = setTimeout(later, remaining);
    }
    return result;
  };

  throttled.cancel = () => {
    clearTimeout(timeoutId);
    previous = 0;
    timeoutId = null;
    lastThis = lastArgs = null;
  };

  return throttled;
};

/**
 * 判断字符串从指定索引开始直到末尾是否全为同一字符
 * @param {string} s 输入字符串
 * @param {string} c 要匹配的目标字符
 * @param {number} i 起始检测索引，默认为 0
 * @returns {boolean}
 */
export const isAllchar = (s, c, i = 0) => {
  while (i < s.length) {
    if (s[i] !== c) {
      return false;
    }
    i++;
  }
  return true;
};

/**
 * 带通配符(*)的字符串匹配逻辑（非正则版双指针回溯匹配算法）
 * @param {string} s 原始字符串 (如当前网页 URL)
 * @param {string} p 通配符匹配模式 (如 rules 中的 pattern)
 * @returns {boolean}
 *
 * REVIEW:
 * 在此处的第 185 行： p = "*" + p + "*";
 * 这个设计在处理规则时，会将通配符匹配自动变更为“模糊包含”模式。
 * 例如：如果用户规则中只想精确匹配以某前缀开头的网址或子域名，因为两端被自动包裹了“*”，
 * 最终匹配效果等价于包含即可，这可能导致一些过于宽泛的误匹配。
 * 如果为了精确控制，建议引入严格的匹配规则，或者区分是否由首尾通配符来进行两端填充。
 */
export const isMatch = (s, p) => {
  if (s.length === 0 || p.length === 0) {
    return false;
  }

  p = "*" + p + "*";

  let [sIndex, pIndex] = [0, 0];
  let [sRecord, pRecord] = [-1, -1];
  while (sIndex < s.length && pRecord < p.length) {
    if (p[pIndex] === "*") {
      pIndex++;
      [sRecord, pRecord] = [sIndex, pIndex];
    } else if (s[sIndex] === p[pIndex]) {
      sIndex++;
      pIndex++;
    } else if (sRecord + 1 < s.length) {
      sRecord++;
      [sIndex, pIndex] = [sRecord, pRecord];
    } else {
      return false;
    }
  }

  if (p.length === pIndex) {
    return true;
  }

  return isAllchar(p, "*", pIndex);
};

/**
 * 检测数据的实际 JavaScript 原生类型
 * @param {*} o 待检测对象
 * @returns {string} 小写的类型名称 (如 "string", "array", "object" 等)
 */
export const type = (o) => {
  const s = Object.prototype.toString.call(o);
  return s.match(/\[object (.*?)\]/)[1].toLowerCase();
};

/**
 * 计算带盐 (salt) 的字符串的 SHA-256 哈希散列值 (常用于数据防篡改校验)
 * @param {string} text 输入文本
 * @param {string} salt 盐
 * @returns {Promise<string>} 16 进制字符串格式的 SHA-256 哈希值
 */
export const sha256 = async (text, salt) => {
  const data = new TextEncoder().encode(text + salt);
  const digest = await crypto.subtle.digest({ name: "SHA-256" }, data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * 随机生成不重复的随机交互事件名称 (用于插件在 unsafeWindow 下隔离通信防冲突)
 * @returns {string}
 */
export const genEventName = () => `kiss-${btoa(Math.random()).slice(3, 11)}`;

/**
 * 判断两个 Set 集合的内容是否完全相同
 * @param {Set} a
 * @param {Set} b
 * @returns {boolean}
 */
export const isSameSet = (a, b) => {
  const s = new Set([...a, ...b]);
  return s.size === a.size && s.size === b.size;
};

/**
 * 去掉字符串末尾某个字符
 * @param {*} s
 * @param {*} c
 * @param {*} count
 * @returns
 */
/**
 * 去掉字符串末尾若干个特定字符
 * @param {string} s 输入字符串
 * @param {string} c 要删除的目标尾部字符
 * @param {number} count 最多连续删除的数量限制
 * @returns {string}
 */
export const removeEndchar = (s, c, count = 1) => {
  if (!s) return "";

  let i = s.length;
  while (i > s.length - count && s[i - 1] === c) {
    i--;
  }
  return s.slice(0, i);
};

/**
 * 在输入框即时翻译时，解析匹配包含翻译目标语言代码和翻译内容的字符串
 * @param {string} str 输入框当前输入的整句字符串
 * @param {string} sign 触发翻译前缀符号 (如 "/", "//", ">" 等)
 * @returns {RegExpMatchArray|null}
 */
export const matchInputStr = (str, sign) => {
  switch (sign) {
    case "//":
      return str.match(/\/\/([\w-]+)\s+([^]+)/); // 例：//en Hello -> 捕获 "en" 和 "Hello"
    case "\\":
      return str.match(/\\([\w-]+)\s+([^]+)/);
    case "\\\\":
      return str.match(/\\\\([\w-]+)\s+([^]+)/);
    case ">":
      return str.match(/>([\w-]+)\s+([^]+)/);
    case ">>":
      return str.match(/>>([\w-]+)\s+([^]+)/);
    default:
  }
  return str.match(/\/([\w-]+)\s+([^]+)/); // 默认符号 "/"
};

/**
 * 判断字符串是否为合法的纯英文单词（仅支持字母及中划线，用于跳过单单词翻译或词典单独查词）
 * @param {string} str 待检测文本
 * @returns {boolean}
 */
export const isValidWord = (str) => {
  const regex = /^[a-zA-Z-]+$/;
  return regex.test(str);
};

/**
 * 将 Blob 文件数据异步转换为 Base64 编码的 DataURL
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export const blobToBase64 = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
};

/**
 * 容错率极高的 JSON 字符串解析函数，支持自动补齐两端的花括号 "{}"
 * @param {string} str JSON 字符串
 * @returns {object} 解析成功的对象，若失败返回空对象 {}
 */
export const parseJsonObj = (str) => {
  if (!str || type(str) !== "string") {
    return {};
  }

  try {
    if (str.trim()[0] !== "{") {
      str = `{${str}}`; // 自动补齐缺失的首尾大括号
    }
    return JSON.parse(str);
  } catch (err) {
    // 解析静默失败
  }

  return {};
};

/**
 * 使用正则表达式在大模型混杂多余文案的返回中提取出首个 JSON 对象或数组字符串
 * @param {string} raw AI 模型的原始混杂回复文本
 * @returns {string|null} 提取出的 JSON 子串
 */
export const extractJson = (raw) => {
  const jsonRegex = /({.*}|\[.*\])/s; // 采用 dotAll 模式（/s）以匹配跨行的 JSON 结构
  const match = raw.match(jsonRegex);
  return match ? match[0] : null;
};

/**
 * 浏览器空闲调度执行器，若不支持 requestIdleCallback 则退化为普通的 setTimeout
 * @param {Function} cb
 * @param {number} timeout 最大等待超时
 * @returns {number} 调度 ID
 */
export const scheduleIdle = (cb, timeout = 200) => {
  if (window.requestIdleCallback) {
    return requestIdleCallback(cb, { timeout });
  }
  return setTimeout(cb, timeout);
};

/**
 * 根据页面 URL，提取通用的主机名/域名 Pattern
 * @param {string} href
 * @returns {string}
 */
export const parseUrlPattern = (href) => {
  if (href.startsWith("file")) {
    const filename = href.substring(href.lastIndexOf("/") + 1);
    return filename; // 本地文件取文件名
  } else if (href.startsWith("http")) {
    const url = new URL(href);
    return url.host; // HTTP/HTTPS 提取 host
  }
  return href;
};

/**
 * 为异步 Promise 任务或待执行的闭包设置超时边界
 * @param {Promise|Function} task 异步任务
 * @param {number} timeout 超时时间（毫秒）
 * @param {string} [timeoutMsg] 超时错误描述
 * @returns {Promise}
 */
export const withTimeout = (task, timeout, timeoutMsg = "Task timed out") => {
  const promise = typeof task === "function" ? task() : task;
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMsg)), timeout)
    ),
  ]);
};

/**
 * 截短长句文本，并在末尾添加省略号 " …"
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export const truncateWords = (str, maxLength = 300) => {
  if (typeof str !== "string") return "";
  if (str.length <= maxLength) return str;
  const truncated = str.slice(0, maxLength);
  return truncated.slice(0, truncated.lastIndexOf(" ")) + " …";
};

/**
 * 生成介于 [min, max) 之间的随机数
 * @param {number} min
 * @param {number} max
 * @param {boolean} integer 是否返回整数，默认 true
 * @returns {number}
 */
export const randomBetween = (min, max, integer = true) => {
  const value = Math.random() * (max - min) + min;
  return integer ? Math.floor(value) : value;
};

/**
 * 辅助方法：根据文件名自动匹配导出/下载文件时的 MIME Content-Type
 * @param {string} filename 文件名
 * @returns {string} MIME 字符串
 */
function getMimeTypeFromFilename(filename) {
  const defaultType = "application/octet-stream";
  if (!filename || filename.indexOf(".") === -1) {
    return defaultType;
  }

  const extension = filename.split(".").pop().toLowerCase();
  const mimeMap = {
    // 文本
    txt: "text/plain;charset=utf-8",
    html: "text/html;charset=utf-8",
    css: "text/css;charset=utf-8",
    js: "text/javascript;charset=utf-8",
    json: "application/json;charset=utf-8",
    xml: "application/xml;charset=utf-8",
    md: "text/markdown;charset=utf-8",
    vtt: "text/vtt;charset=utf-8",

    // 图像
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",

    // 音频/视频
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    wav: "audio/wav",

    // 应用程序/文档
    pdf: "application/pdf",
    zip: "application/zip",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return mimeMap[extension] || defaultType;
}

/**
 * 触发浏览器的文件下载功能（将文本转换为 BlobURL 并创建虚拟 <a> 标签点击）
 * @param {string} str 文件数据字符串
 * @param {string} filename 导出的保存文件名
 */
export function downloadBlobFile(str, filename = "kiss-file.txt") {
  const mimeType = getMimeTypeFromFilename(filename);
  const blob = new Blob([str], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename || `kiss-file.txt`;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 解析用户输入的 AI 专业术语库字符串（格式：原文,译文 每行或以分号分隔一个词）
 * @param {string} termsString
 * @returns {Record<string, string>} 键值对字典对象
 */
export function parseAITerms(termsString) {
  if (typeof termsString !== "string" || termsString.trim() === "") return {};

  try {
    return Object.fromEntries(
      termsString
        .split(/\n|;/)
        .map((line) => {
          const [k = "", v = ""] = line.split(",").map((s) => s.trim());
          return [k, v];
        })
        .filter(([k]) => k)
    );
  } catch (err) {
    return {};
  }
}

/**
 * 检查当前文本是否仅为单个中文汉字字符
 * @param {string} str
 * @returns {boolean}
 */
export const isSingleChineseChar = (str) => {
  return /^[\u4e00-\u9fa5]$/.test(str || "");
};
