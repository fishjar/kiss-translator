import { URL_DEEPLFREE_TRAN } from "../config";

let id = 1e4 * Math.round(1e4 * Math.random());

export const genDeeplFree = ({ text, from, to }) => {
  const iCount = (text.match(/[i]/g) || []).length + 1;
  let timestamp = Date.now();
  timestamp = timestamp + (iCount - (timestamp % iCount));
  id++;

  let body = JSON.stringify({
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
          requestAlternatives: 3,
        },
      ],
    },
  });

  body = body.replace(
    'method":"',
    (id + 3) % 13 === 0 || (id + 5) % 29 === 0 ? 'method" : "' : 'method": "'
  );

  const init = {
    headers: {
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
    },
    method: "POST",
    body,
  };

  return [URL_DEEPLFREE_TRAN, init];
};
