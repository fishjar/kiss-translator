import queryString from "query-string";
import { encodeHTMLTranslationText } from "../libs/html";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genGoogle = ({ texts, from, to, url, key }) => {
  const params = queryString.stringify({
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: from,
    tl: to,
    q: texts.join(" "),
  });
  url = `${url}?${params}`;
  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, headers, method: "GET" };
};

const genGoogle2 = ({ texts, from, to, url, key, textFormat = "text" }) => {
  const requestTexts =
    textFormat === "html" ? texts : texts.map(encodeHTMLTranslationText);
  const body = [[requestTexts, from, to], "wt_lib"];
  const headers = {
    "Content-Type": "application/json+protobuf",
    "X-Goog-API-Key": key,
  };

  return { url, body, headers };
};

const genGoogleCloud = ({ texts, from, to, url, key, textFormat = "text" }) => {
  const body = {
    q: texts,
    target: to,
    format: textFormat,
    ...(from !== "auto" && { source: from }),
  };
  const headers = {
    "Content-type": "application/json",
    "X-Goog-Api-Key": key,
  };

  return { url, body, headers };
};

export { genGoogle, genGoogle2, genGoogleCloud };
