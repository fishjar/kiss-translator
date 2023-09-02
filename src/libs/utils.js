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
  let timer;
  return (...args) => {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, delay);
  };
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

  p = `*${p}*`;

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

  return p.slice(pIndex).replaceAll("*", "") === "";
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
export const genEventName = () => btoa(Math.random()).slice(3, 11);
