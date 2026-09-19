import { fetchGM } from "./fetch";
import { genEventName } from "./utils";
import { getGmMethod, getNativeGm } from "./gmMethods";

export { getGmMethod, getNativeGm } from "./gmMethods";

// 各项 GM (Greasemonkey) 跨沙盒通信指令
const MSG_GM_xmlHttpRequest = "xmlHttpRequest";
const MSG_GM_xmlHttpRequestAbort = "xmlHttpRequestAbort";
const MSG_GM_setValue = "setValue";
const MSG_GM_getValue = "getValue";
const MSG_GM_deleteValue = "deleteValue";
const MSG_GM_addValueChangeListener = "addValueChangeListener";
const MSG_GM_removeValueChangeListener = "removeValueChangeListener";
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
const gmValueListeners = new Map();

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

      // Register the timeout before dispatch because a bridge can reply immediately.
      window.addEventListener(pong, handleEvent);
      timer = setTimeout(() => {
        window.removeEventListener(pong, handleEvent);
        reject(new Error("timeout"));
      }, timeout);

      window.dispatchEvent(
        new CustomEvent(ping, { detail: { action, args, pong } })
      );
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

  const valueListeners = new Map();
  const removeValueChangeListener = async (listenerId) => {
    const registration = valueListeners.get(listenerId);
    if (!registration) return;
    window.removeEventListener(listenerId, registration.listener);
    if (!registration.removal) {
      registration.removal = promiseGM(MSG_GM_removeValueChangeListener, {
        listenerId,
      }).then(
        () => valueListeners.delete(listenerId),
        (error) => {
          registration.removal = undefined;
          throw error;
        }
      );
    }
    await registration.removal;
  };
  const addValueChangeListener = async (key, callback) => {
    const listenerId = `${genEventName()}-value`;
    const listener = (event) => {
      if (event.detail?.change) callback(...event.detail.change);
    };
    valueListeners.set(listenerId, { listener });
    window.addEventListener(listenerId, listener);
    try {
      await promiseGM(MSG_GM_addValueChangeListener, { key, listenerId });
      return listenerId;
    } catch (error) {
      // The caller never received this token, so retry orphan cleanup once.
      void removeValueChangeListener(listenerId)
        .catch(() => removeValueChangeListener(listenerId))
        .catch(() => {
          // A final lifecycle attempt never removes active BFCache subscriptions.
          window.addEventListener(
            "pagehide",
            () => {
              void removeValueChangeListener(listenerId).catch(() => {});
            },
            { once: true }
          );
        });
      throw error;
    }
  };

  // 挂载垫片到宿主页面 window，使运行在普通页面沙盒中的 React / Web 业务代码可以像调用原生 GM 般顺畅
  window.KISS_GM = {
    fetch: (input, init) => promiseGM(MSG_GM_xmlHttpRequest, { input, init }),
    xmlHttpRequest,
    setValue: (key, val) => promiseGM(MSG_GM_setValue, { key, val }),
    getValue: (key) => promiseGM(MSG_GM_getValue, { key }),
    deleteValue: (key) => promiseGM(MSG_GM_deleteValue, { key }),
    addValueChangeListener,
    removeValueChangeListener,
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
      case MSG_GM_addValueChangeListener: {
        const { key, listenerId } = args;
        if (gmValueListeners.has(listenerId))
          throw new Error("GM storage listener already exists");
        const addListener = getGmMethod(
          "addValueChangeListener",
          "GM_addValueChangeListener"
        );
        const removeListener = getGmMethod(
          "removeValueChangeListener",
          "GM_removeValueChangeListener"
        );
        const registration = { active: true, removeListener };
        gmValueListeners.set(listenerId, registration);
        registration.pending = Promise.resolve().then(() =>
          addListener(key, (...change) => {
            if (registration.active) {
              window.dispatchEvent(
                new CustomEvent(listenerId, { detail: { change } })
              );
            }
          })
        );
        try {
          await registration.pending;
          res = listenerId;
        } catch (error) {
          if (gmValueListeners.get(listenerId) === registration)
            gmValueListeners.delete(listenerId);
          throw error;
        }
        break;
      }
      case MSG_GM_removeValueChangeListener: {
        const registration = gmValueListeners.get(args.listenerId);
        if (registration) {
          registration.active = false;
          if (!registration.removal) {
            registration.removal = registration.pending
              .then((nativeId) => registration.removeListener(nativeId))
              .then(
                () => gmValueListeners.delete(args.listenerId),
                (error) => {
                  registration.removal = undefined;
                  throw error;
                }
              );
          }
          await registration.removal;
        }
        res = "ok";
        break;
      }
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
