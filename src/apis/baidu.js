import { DEFAULT_USER_AGENT } from "../config";

/**
 * 构造百度翻译私有接口的请求载荷。
 * @param {Object} params
 * @param {Array<string>} params.texts 待翻译的原文数组
 * @param {string} params.from 原语言
 * @param {string} params.to 目标翻译语言
 * @returns {{url: string, body: Object, headers: Object}} 百度翻译 API 接口所需请求的 url、参数及请求头
 */
export const genBaidu = ({ texts, from, to }) => {
  const body = {
    from,
    to,
    // REVIEW: 百度此接口设计仅支持单文本翻译。此处将 texts 数组用空格连接（join(" ")）合并为单字符串发送，
    // 翻译返回后也是单一译文，这会丢失原文多段落的物理映射结构，适合简单行内句级翻译，不适合复杂的段落级双语对照翻译。
    query: texts.join(" "),
    source: "txt",
  };

  const url = "https://fanyi.baidu.com/transapi";
  const headers = {
    // Origin 请求头可能会引起浏览器的跨域拦截，故在前端打包代码中予以注释，
    // 其真实重写工作在 background.js 中的 declarativeNetRequest/Origin 修改段动态代理完成
    // Origin: "https://fanyi.baidu.com",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "User-Agent": DEFAULT_USER_AGENT,
  };

  return { url, body, headers };
};
