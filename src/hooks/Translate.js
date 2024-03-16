import { useEffect } from "react";
import { useState } from "react";
import { tryDetectLang } from "../libs";
import { apiTranslate } from "../apis";
import { DEFAULT_TRANS_APIS } from "../config";

/**
 * 翻译hook
 * @param {*} q
 * @param {*} rule
 * @param {*} setting
 * @returns
 */
export function useTranslate(q, rule, setting) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sameLang, setSamelang] = useState(false);

  const { translator, fromLang, toLang, detectRemote, skipLangs = [] } = rule;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        if (!q.replace(/\[(\d+)\]/g, "").trim()) {
          setText(q);
          setSamelang(false);
          return;
        }

        const deLang = await tryDetectLang(q, detectRemote === "true");
        if (deLang && (toLang.includes(deLang) || skipLangs.includes(deLang))) {
          setSamelang(true);
        } else {
          const [trText, isSame] = await apiTranslate({
            translator,
            text: q,
            fromLang,
            toLang,
            apiSetting:
              setting.transApis?.[translator] || DEFAULT_TRANS_APIS[translator],
          });
          setText(trText);
          setSamelang(isSame);
        }
      } catch (err) {
        console.log("[translate]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [q, translator, fromLang, toLang, detectRemote, skipLangs, setting]);

  return { text, sameLang, loading };
}
