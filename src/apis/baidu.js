import queryString from "query-string";
import { DEFAULT_USER_AGENT } from "../config";

export const genBaidu = async ({ text, from, to }) => {
  const data = {
    from,
    to,
    query: text,
    source: "txt",
  };

  const input = "https://fanyi.baidu.com/transapi";
  const init = {
    headers: {
      // Origin: "https://fanyi.baidu.com",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    method: "POST",
    body: queryString.stringify(data),
  };

  return [input, init];
};
