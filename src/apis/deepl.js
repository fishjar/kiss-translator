// 初始化一个随机的 JSON-RPC 请求 ID
let id = 1e4 * Math.round(1e4 * Math.random());

/**
 * 构造 DeepL 免费端点 (JSON-RPC) 的逆向代理请求。
 * 包含对 DeepL 官方 App 请求头及时间戳签名防爬机制的完美伪装。
 * @param {Object} params
 * @param {Array<string>} params.texts 待翻译文本数组
 * @param {string} params.from 原语言简写
 * @param {string} params.to 目标翻译语言简写
 * @returns {{url: string, body: Object, headers: Object}} DeepL 接口的请求 url、JSON-RPC 参数及伪装 headers
 */
export const genDeeplFree = ({ texts, from, to }) => {
  const text = texts.join(" ");

  // REVIEW: 针对 DeepL 免费接口的“防爬虫人机签名算法”：
  // 1. 统计翻译文本中字母 "i" 的出现次数作为除数基数 iCount
  const iCount = (text.match(/[i]/g) || []).length + 1;
  let timestamp = Date.now();
  // 2. 调整 timestamp 时间戳，使其能够被 iCount 整除（即满足模运算 timestamp % iCount === 0），
  // 从而绕过 DeepL 网关对请求时间戳的哈希校验。这行精妙的逆向签名代码非常关键。
  timestamp = timestamp + (iCount - (timestamp % iCount));
  id++;

  const url = "https://www2.deepl.com/jsonrpc";

  const body = {
    jsonrpc: "2.0",
    method: "LMT_handle_texts",
    params: {
      splitting: "newlines",
      lang: {
        target_lang: to,
        source_lang_user_selected: from,
      },
      commonJobParams: {
        wasSpoken: false,
        transcribe_as: "",
      },
      id,
      timestamp,
      texts: [
        {
          text,
          requestAlternatives: 3, // 请求生成 3 种备选翻译候选结果
        },
      ],
    },
  };

  // REVIEW: 伪装 headers 字段。
  // 将 User-Agent、设备标识等完全伪装为 DeepL 官方的 iOS 客户端 App (版本 2.9.1)，
  // 这能有效绕过 DeepL 网页端对请求频率的严苛检测（Web 版常会弹出 Cloudflare 验证码），非常高明。
  const headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
    "x-app-os-name": "iOS",
    "x-app-os-version": "16.3.0",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "x-app-device": "iPhone13,2",
    "User-Agent": "DeepL-iOS/2.9.1 iOS 16.3.0 (iPhone13,2)",
    "x-app-build": "510265",
    "x-app-version": "2.9.1",
  };

  return { url, body, headers };
};
