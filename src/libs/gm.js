import { fetchGM } from "./fetch";
import { genEventName } from "./utils";

// 各项 GM (Greasemonkey) 跨沙盒通信指令
const MSG_GM_xmlHttpRequest = "xmlHttpRequest";
const MSG_GM_xmlHttpRequestAbort = "xmlHttpRequestAbort";
const MSG_GM_setValue = "setValue";
const MSG_GM_getValue = "getValue";
const MSG_GM_deleteValue = "deleteValue";
const MSG_GM_info = "info";
const GM_XHR_CALLBACKS = [
  "onloadstart",
  "onprogress",
  "onreadystatechange",
  "onload",
  "onerror",
  "onabort",
  "ontimeout",
];
const GM_XHR_TERMINAL_CALLBACKS = new Set([
  "onload",
  "onerror",
  "onabort",
  "ontimeout",
]);
const gmRequestHandles = new Map();

/**
 * 获取原生的 GM (Greasemonkey) 对象。
 * 兼容不同的油猴脚本管理器环境（部分管理器将其暴露为独立变量，部分挂载于 globalThis）。
 * @returns {Object|undefined} 返回原生的 GM 对象，若不存在则返回 undefined
 */
export function getNativeGm() {
  if (typeof GM !== "undefined") {
    return GM;
  }

  return globalThis.GM;
}

/**
 * 通用方法：安全地获取并绑定对应的 GM API 接口。
 * 执行查找策略：
 * 1. 优先在传入的 fallbackObjects (例如沙盒桥接的 window.KISS_GM) 中查找。
 * 2. 其次在原生 GM Promise API (如 GM.setValue) 中查找。
 * 3. 最后回退查找旧版同步 API (如 GM_setValue)。
 * @param {string} method 新版 Promise 风格的 GM API 键名 (例如 "setValue")
 * @param {string} legacyMethod 旧版同步风格的 GM API 键名 (例如 "GM_setValue")
 * @param {Array<Object>} fallbackObjects 需要优先遍历的备选/代理对象数组
 * @returns {Function} 已绑定正确上下文 (this) 的可执行 GM API 函数
 * @throws {Error} 若在所有备选环境中均找不到该 API，则抛出异常
 */
export function getGmMethod(method, legacyMethod, fallbackObjects = []) {
  const gmObjects = [...fallbackObjects, getNativeGm()];
  for (const obj of gmObjects) {
    const api = obj?.[method];
    if (typeof api === "function") {
      // 必须绑定原始上下文，防止原生函数调用时丢失对象指针而报错 (Illegal invocation)
      return api.bind(obj);
    }
  }

  const legacyApi = globalThis[legacyMethod];
  if (typeof legacyApi === "function") {
    return legacyApi;
  }

  throw new Error(`GM API is not available: ${method}`);
}

/**
 * 跨环境获取油猴脚本的元信息 (GM_info)。
 * @returns {Object} 包含插件版本、脚本信息的对象数据
 */
function getGmInfo() {
  const gm = getNativeGm();
  return gm?.info || globalThis.GM_info;
}

/**
 * 注入网页的初始化脚本，用于将油猴基本信息与事件通道公开给页面环境。
 * @param {string} ping 特权环境监听的自定义 CustomEvent 事件名称
 */
export const injectScript = (ping) => {
  window.APP_INFO = {
    name: process.env.REACT_APP_NAME,
    version: process.env.REACT_APP_VERSION,
    eventName: ping, // 将监听的事件名暴露在全局，以便页面内代码进行事件通信
  };
};

/**
 * 运行在普通页面沙盒中的适配器。
 * 创建一个 `window.KISS_GM` 垫片对象，将对 GM 存储和跨域请求的调用，
 * 通过 CustomEvent 跨沙盒消息机制代理到拥有特权 API 权限的油猴脚本环境（Content Script）中执行。
 * @param {string} ping 接受页面请求的 CustomEvent 监听事件名称
 */
export const adaptScript = (ping) => {
  /**
   * 通用的 CustomEvent 异步请求封装。
   * @param {string} action 需要执行的 GM 操作
   * @param {Object} args 指令对应参数
   * @param {number} timeout 超时时间 (毫秒)，默认 5000ms
   * @returns {Promise<*>} 接收特权环境处理后返回的数据
   */
  const promiseGM = (action, args, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const pong = genEventName(); // 动态生成一个唯一的事件名作为回调通道
      let timer = null;

      const handleEvent = (e) => {
        // 收到消息后立即解绑监听器，防止多次触发
        window.removeEventListener(pong, handleEvent);
        if (timer) clearTimeout(timer); // 收到正常响应时及时清除超时定时器

        const { data, error } = e.detail;
        if (error) {
          reject(new Error(error));
        } else {
          resolve(data);
        }
      };

      // 1. 注册接收回调的临时事件监听器
      window.addEventListener(pong, handleEvent);

      // 2. 向特权油猴脚本环境分发请求事件
      window.dispatchEvent(
        new CustomEvent(ping, { detail: { action, args, pong } })
      );

      // 3. 注册超时保险定时器，避免请求卡死造成内存监听器泄露
      // REVIEW: 原实现中没有 clearTimeout 句柄。如果请求正常 resolve，
      // 该定时器仍会触发并无害地执行一次 removeEventListener，但会堆积临时定时器。已在此处优化加入 timer 清理。
      timer = setTimeout(() => {
        window.removeEventListener(pong, handleEvent);
        reject(new Error("timeout"));
      }, timeout);
    });

  const xmlHttpRequest = (details) => {
    const pong = genEventName();
    const callbacks = {};
    const requestDetails = { ...details };

    GM_XHR_CALLBACKS.forEach((name) => {
      if (typeof requestDetails[name] === "function") {
        callbacks[name] = requestDetails[name];
        delete requestDetails[name];
      }
    });

    const cleanup = () => window.removeEventListener(pong, handleEvent);
    const handleEvent = (e) => {
      const { callback, data, error } = e.detail || {};
      if (error) {
        cleanup();
        callbacks.onerror?.(new Error(error));
        return;
      }

      callbacks[callback]?.(data);
      if (GM_XHR_TERMINAL_CALLBACKS.has(callback)) {
        cleanup();
      }
    };

    window.addEventListener(pong, handleEvent);
    window.dispatchEvent(
      new CustomEvent(ping, {
        detail: {
          action: MSG_GM_xmlHttpRequest,
          args: { details: requestDetails },
          pong,
        },
      })
    );

    return {
      abort: () => {
        window.dispatchEvent(
          new CustomEvent(ping, {
            detail: {
              action: MSG_GM_xmlHttpRequestAbort,
              args: { requestId: pong },
            },
          })
        );
      },
    };
  };

  // 挂载垫片到宿主页面 window，使运行在普通页面沙盒中的 React / Web 业务代码可以像调用原生 GM 般顺畅
  window.KISS_GM = {
    fetch: (input, init) => promiseGM(MSG_GM_xmlHttpRequest, { input, init }),
    xmlHttpRequest,
    setValue: (key, val) => promiseGM(MSG_GM_setValue, { key, val }),
    getValue: (key) => promiseGM(MSG_GM_getValue, { key }),
    deleteValue: (key) => promiseGM(MSG_GM_deleteValue, { key }),
    getInfo: async () => {
      if (!window.GM_info) {
        window.GM_info = await promiseGM(MSG_GM_info);
      }
      return window.GM_info;
    },
  };
};

/**
 * 监听并响应普通页面通过 CustomEvent 派发的 GM 特权调用请求。
 * 运行在具有 GM 权限的 Userscript 脚本沙盒中。
 * @param {CustomEvent} e 派发的事件对象
 */
export const handlePing = async (e) => {
  // REVIEW: 安全性警告！
  // 此处没有校验请求源或进行令牌(Token)认证。如果宿主网页中存在恶意第三方脚本，
  // 可以通过读取 `window.APP_INFO.eventName` 轻松获取通信事件名，
  // 继而构造伪造的 CustomEvent 来调用 `setValue`、`getValue` 甚至是 `xmlHttpRequest` 跨域代理。
  // 这会导致存储隐私泄露、数据被恶意覆写、甚至利用特权跨域请求实施 CSRF 攻击。
  // 建议今后在此处加入简单的会话 Token 校验机制。
  let pong;
  let res;
  try {
    const { action, args: rawArgs = {}, pong: eventPong } = e?.detail || {};
    const args = rawArgs || {};
    pong = eventPong;
    if (!action) return;

    switch (action) {
      case MSG_GM_xmlHttpRequest:
        if (Object.prototype.hasOwnProperty.call(args, "input")) {
          const { input, init } = args;
          res = await fetchGM(input, init); // 调用跨域特权 fetch
          break;
        }

        gmRequestHandles.set(
          pong,
          getGmMethod(
            "xmlHttpRequest",
            "GM_xmlhttpRequest"
          )(
            GM_XHR_CALLBACKS.reduce(
              (details, name) => ({
                ...details,
                [name]: (data) => {
                  window.dispatchEvent(
                    new CustomEvent(pong, {
                      detail: { callback: name, data },
                    })
                  );
                  if (GM_XHR_TERMINAL_CALLBACKS.has(name)) {
                    gmRequestHandles.delete(pong);
                  }
                },
              }),
              args.details
            )
          )
        );
        return;
      case MSG_GM_xmlHttpRequestAbort:
        gmRequestHandles.get(args.requestId)?.abort?.();
        gmRequestHandles.delete(args.requestId);
        return;
      case MSG_GM_setValue:
        const { key, val } = args;
        await getGmMethod("setValue", "GM_setValue")(key, val);
        res = val;
        break;
      case MSG_GM_getValue:
        res = await getGmMethod("getValue", "GM_getValue")(args.key);
        break;
      case MSG_GM_deleteValue:
        await getGmMethod("deleteValue", "GM_deleteValue")(args.key);
        res = "ok";
        break;
      case MSG_GM_info:
        res = getGmInfo();
        break;
      default:
        throw new Error(`message action is unavailable: ${action}`);
    }

    // 成功处理后，向回调事件 pong 发送成功报文
    if (pong) {
      window.dispatchEvent(new CustomEvent(pong, { detail: { data: res } }));
    }
  } catch (err) {
    // 捕获异常并反馈给回调页面
    if (pong) {
      window.dispatchEvent(
        new CustomEvent(pong, { detail: { error: err.message } })
      );
    }
  }
};
