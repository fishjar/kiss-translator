import queryString from "query-string";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genMicrosoft = ({ texts, from, to }) => {
  // Edge 前端内部端点：无需鉴权，Body 为纯字符串数组；from 留空表示自动检测。
  const params = queryString.stringify({
    from: from || "",
    to,
    isEnterpriseClient: false,
  });
  const url = `https://edge.microsoft.com/translate/translatetext?${params}`;
  const headers = {
    "Content-type": "application/json",
  };

  return { url, body: texts, headers };
};

const genAzureAI = ({ texts, from, to, url, key, region }) => {
  const params = queryString.stringify({
    from,
    to,
  });
  url = url.endsWith("&") ? `${url}${params}` : `${url}&${params}`;
  const headers = {
    "Content-type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
    "Ocp-Apim-Subscription-Region": region,
  };
  const body = texts.map((text) => ({ Text: text }));

  return { url, body, headers };
};

export { genMicrosoft, genAzureAI };
