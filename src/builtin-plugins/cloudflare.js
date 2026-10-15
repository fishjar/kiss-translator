// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genCloudflareAI = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    source_lang: from,
    target_lang: to,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

export { genCloudflareAI };
