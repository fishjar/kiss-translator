import { DEFAULT_USER_AGENT } from "../config";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genTencent = ({ texts, from, to }) => {
  const body = {
    header: {
      fn: "auto_translation",
      client_key:
        "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487",
    },
    type: "plain",
    model_category: "normal",
    source: {
      text_list: texts,
      lang: from,
    },
    target: {
      lang: to,
    },
  };

  const url = "https://transmart.qq.com/api/imt";
  const headers = {
    "Content-Type": "application/json",
    "user-agent": DEFAULT_USER_AGENT,
    referer: "https://transmart.qq.com/zh-CN/index",
  };

  return { url, body, headers };
};

export { genTencent };
