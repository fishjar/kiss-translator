import { useEffect } from "react";
import { useState } from "react";
import { tryDetectLang } from "../libs";
import { apiTranslate } from "../apis";
import { DEFAULT_TRANS_APIS } from "../config";
import { kissLog } from "../libs/log";

/**
 * 翻译hook
 * @param {*} q
 * @param {*} rule
 * @param {*} setting
 * @returns
 */
export function useTranslate(q, rule, setting, docInfo) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sameLang, setSamelang] = useState(false);

  const { translator, fromLang, toLang, detectRemote, skipLangs = [] } = rule;

  useEffect(() => {
    (async () => {
      try {
        if (!q.replace(/\[(\d+)\]/g, "").trim()) {
          setText(q);
          setSamelang(false);
          return;
        }

        let deLang = "";
        if (fromLang === "auto") {
          deLang = await tryDetectLang(
            q,
            detectRemote === "true",
            setting.langDetector
          );
        }
        if (deLang && (toLang.includes(deLang) || skipLangs.includes(deLang))) {
          setSamelang(true);
        } else {
          const [trText, isSame] = await apiTranslate({
            translator,
            text: q,
            fromLang,
            toLang,
            apiSetting: {
              ...DEFAULT_TRANS_APIS[translator],
              ...(setting.transApis[translator] || {}),
            },
            docInfo,
          });
          setText(trText);
          setSamelang(isSame);
        }
      } catch (err) {
        kissLog(err, "translate");
      } finally {
        setLoading(false);
      }
    })();
  }, [
    q,
    translator,
    fromLang,
    toLang,
    detectRemote,
    skipLangs,
    setting,
    docInfo,
  ]);

  return { text, sameLang, loading };
}
