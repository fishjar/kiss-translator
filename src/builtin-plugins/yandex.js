import queryString from "query-string";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genYandex = ({ texts, from, to, url, key, folderId }) => {
  const body = {
    folderId,
    texts,
    targetLanguageCode: to,
    ...(from !== "auto" && { sourceLanguageCode: from }),
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Api-Key ${key}`,
  };

  return { url, body, headers };
};

const genYandexFree = ({ texts, from, to }) => {
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  const params = queryString.stringify({
    id: `${id}-0-0`,
    srv: "android",
    source_lang: from,
    target_lang: to,
    text: texts[0],
  });
  const url = `https://translate.yandex.net/api/v1/tr.json/translate?${params}`;

  return { url, method: "POST" };
};

export { genYandex, genYandexFree };
