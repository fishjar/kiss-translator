import { DEFAULT_USER_AGENT } from "../config";

export const genBaidu = ({ texts, from, to }) => {
  const body = {
    from,
    to,
    query: texts.join(" "),
    source: "txt",
  };

  const url = "https://fanyi.baidu.com/transapi";
  const headers = {
    // Origin: "https://fanyi.baidu.com",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "User-Agent": DEFAULT_USER_AGENT,
  };

  return { url, body, headers };
};
