let id = 1e4 * Math.round(1e4 * Math.random());

export const genDeeplFree = ({ texts, from, to }) => {
  const text = texts.join(" ");
  const iCount = (text.match(/[i]/g) || []).length + 1;
  let timestamp = Date.now();
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
          requestAlternatives: 3,
        },
      ],
    },
  };

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
