// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genDeepl = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts,
    target_lang: to,
    source_lang: from,
    // split_sentences: "0",
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `DeepL-Auth-Key ${key}`,
  };

  return { url, body, headers };
};

const genDeeplX = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    target_lang: to,
    source_lang: from,
  };

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers };
};

export { genDeepl, genDeeplX };
