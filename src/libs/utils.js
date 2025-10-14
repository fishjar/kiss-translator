/**
 * 限制数字大小
 * @param {*} num
 * @param {*} min
 * @param {*} max
 * @returns
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
 * 匹配是否为数组中的值
 * @param {*} arr
 * @param {*} val
 * @returns
 */
export const matchValue = (arr, val) => {
  if (arr.length === 0 || arr.includes(val)) {
    return val;
  }
  return arr[0];
};

/**
 * 等待
 * @param {*} delay
 * @returns
 */
export const sleep = (delay) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve();
    }, delay);
  });

/**
 * 防抖函数
 * @param {*} func
 * @param {*} delay
 * @returns
 */
export const debounce = (func, delay = 200) => {
  let timer = null;
  return (...args) => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
      clearTimeout(timer);
      timer = null;
    }, delay);
  };
};

/**
 * 节流函数
 * @param {*} func
 * @param {*} delay
 * @returns
 */
export const throttle = (func, delay = 200) => {
  let timer = null;
  let cache = null;
  return (...args) => {
    if (!timer) {
      func(...args);
      cache = null;
      timer = setTimeout(() => {
        if (cache) {
          func(...cache);
          cache = null;
        }
        clearTimeout(timer);
        timer = null;
      }, delay);
    } else {
      cache = args;
    }
  };
};

/**
 * 判断字符串全是某个字符
 * @param {*} s
 * @param {*} c
 * @param {*} i
 * @returns
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
 * 字符串通配符(*)匹配
 * @param {*} s
 * @param {*} p
 * @returns
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
 * 类型检查
 * @param {*} o
 * @returns
 */
export const type = (o) => {
  const s = Object.prototype.toString.call(o);
  return s.match(/\[object (.*?)\]/)[1].toLowerCase();
};

/**
 * sha256
 * @param {*} text
 * @returns
 */
export const sha256 = async (text, salt) => {
  const data = new TextEncoder().encode(text + salt);
  const digest = await crypto.subtle.digest({ name: "SHA-256" }, data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * 生成随机事件名称
 * @returns
 */
export const genEventName = () => `kiss-${btoa(Math.random()).slice(3, 11)}`;

/**
 * 判断两个 Set 是否相同
 * @param {*} a
 * @param {*} b
 * @returns
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
export const removeEndchar = (s, c, count = 1) => {
  if (!s) return "";

  let i = s.length;
  while (i > s.length - count && s[i - 1] === c) {
    i--;
  }
  return s.slice(0, i);
};

/**
 * 匹配字符串及语言标识
 * @param {*} str
 * @param {*} sign
 * @returns
 */
export const matchInputStr = (str, sign) => {
  switch (sign) {
    case "//":
      return str.match(/\/\/([\w-]+)\s+([^]+)/);
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
  return str.match(/\/([\w-]+)\s+([^]+)/);
};

/**
 * 判断是否英文单词
 * @param {*} str
 * @returns
 */
export const isValidWord = (str) => {
  const regex = /^[a-zA-Z-]+$/;
  return regex.test(str);
};

/**
 * blob转为base64
 * @param {*} blob
 * @returns
 */
export const blobToBase64 = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
};

/**
 * 获取html内的文本
 * @param {*} htmlStr
 * @param {*} skipTag
 * @returns
 */
export const getHtmlText = (htmlStr, skipTag = "") => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, "text/html");

  if (skipTag) {
    doc.querySelectorAll(skipTag).forEach((el) => el.remove());
  }

  return doc.body.innerText.trim();
};

/**
 * 解析JSON字符串对象
 * @param {*} str
 * @returns
 */
export const parseJsonObj = (str) => {
  if (!str || type(str) !== "string") {
    return {};
  }

  try {
    if (str.trim()[0] !== "{") {
      str = `{${str}}`;
    }
    return JSON.parse(str);
  } catch (err) {
    //
  }

  return {};
};

/**
 * 提取json内容
 * @param {*} s
 * @returns
 */
export const extractJson = (raw) => {
  const jsonRegex = /({.*}|\[.*\])/s;
  const match = raw.match(jsonRegex);
  return match ? match[0] : null;
};

/**
 * 空闲执行
 * @param {*} cb
 * @param {*} timeout
 * @returns
 */
export const scheduleIdle = (cb, timeout = 200) => {
  if (window.requestIdleCallback) {
    return requestIdleCallback(cb, { timeout });
  }
  return setTimeout(cb, timeout);
};

/**
 * 截取url部分
 * @param {*} href
 * @returns
 */
export const parseUrlPattern = (href) => {
  if (href.startsWith("file")) {
    const filename = href.substring(href.lastIndexOf("/") + 1);
    return filename;
  } else if (href.startsWith("http")) {
    const url = new URL(href);
    return url.host;
  }
  return href;
};

/**
 * 带超时的任务
 * @param {Promise|Function} task - 任务
 * @param {number} timeout - 超时时间 (毫秒)
 * @param {string} [timeoutMsg] - 超时错误提示
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
 * 截短字符串
 * @param {*} str
 * @param {*} maxLength
 * @returns
 */
export const truncateWords = (str, maxLength = 200) => {
  if (typeof str !== "string") return "";
  if (str.length <= maxLength) return str;
  const truncated = str.slice(0, maxLength);
  return truncated.slice(0, truncated.lastIndexOf(" ")) + " …";
};

/**
 * 生成随机数
 * @param {*} min
 * @param {*} max
 * @param {*} integer
 * @returns
 */
export const randomBetween = (min, max, integer = true) => {
  const value = Math.random() * (max - min) + min;
  return integer ? Math.floor(value) : value;
};
