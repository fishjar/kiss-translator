import { fetchGM } from "./fetch";

/**
 * 注入页面的脚本，请求并接受GM接口信息
 * @param {*} param0
 */
export const injectScript = (ping) => {
  const MSG_GM_xmlHttpRequest = "xmlHttpRequest";
  const MSG_GM_setValue = "setValue";
  const MSG_GM_getValue = "getValue";
  const MSG_GM_deleteValue = "deleteValue";
  const MSG_GM_info = "info";
  let GM_info;

  const promiseGM = (action, args, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const pong = btoa(Math.random()).slice(3, 11);
      const handleEvent = (e) => {
        window.removeEventListener(pong, handleEvent);
        const { data, error } = e.detail;
        if (error) {
          reject(new Error(error));
        } else {
          resolve(data);
        }
      };

      window.addEventListener(pong, handleEvent);
      window.dispatchEvent(
        new CustomEvent(ping, { detail: { action, args, pong } })
      );

      setTimeout(() => {
        window.removeEventListener(pong, handleEvent);
        reject(new Error("timeout"));
      }, timeout);
    });

  window.KISS_GM = {
    fetch: (input, init) => promiseGM(MSG_GM_xmlHttpRequest, { input, init }),
    setValue: (key, val) => promiseGM(MSG_GM_setValue, { key, val }),
    getValue: (key) => promiseGM(MSG_GM_getValue, { key }),
    deleteValue: (key) => promiseGM(MSG_GM_deleteValue, { key }),
    getInfo: () => {
      if (GM_info) {
        return GM_info;
      }
      return promiseGM(MSG_GM_info);
    },
  };
  window.APP_NAME = process.env.REACT_APP_NAME;
};

/**
 * 监听并回应页面对GM接口的请求
 * @param {*} param0
 */
export const handlePing = async (e) => {
  const MSG_GM_xmlHttpRequest = "xmlHttpRequest";
  const MSG_GM_setValue = "setValue";
  const MSG_GM_getValue = "getValue";
  const MSG_GM_deleteValue = "deleteValue";
  const MSG_GM_info = "info";
  const { action, args, pong } = e.detail;
  let res;
  try {
    switch (action) {
      case MSG_GM_xmlHttpRequest:
        const { input, init } = args;
        res = await fetchGM(input, init);
        break;
      case MSG_GM_setValue:
        const { key, val } = args;
        await GM.setValue(key, val);
        res = val;
        break;
      case MSG_GM_getValue:
        res = await GM.getValue(args.key);
        break;
      case MSG_GM_deleteValue:
        await GM.deleteValue(args.key);
        res = "ok";
        break;
      case MSG_GM_info:
        res = GM.info;
        break;
      default:
        throw new Error(`message action is unavailable: ${action}`);
    }

    window.dispatchEvent(new CustomEvent(pong, { detail: { data: res } }));
  } catch (err) {
    window.dispatchEvent(
      new CustomEvent(pong, { detail: { error: err.message } })
    );
  }
};
