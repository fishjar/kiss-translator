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

  const { translator, fromLang, toLang } = rule;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const deLang = await tryDetectLang(q);
        if (deLang && toLang.includes(deLang)) {
          setSamelang(true);
        } else {
          const [trText, isSame] = await apiTranslate({
            translator,
            text: q,
            fromLang,
            toLang,
            apiSetting: (setting.transApis || DEFAULT_TRANS_APIS)[translator],
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
  }, [q, translator, fromLang, toLang, setting]);

  return { text, sameLang, loading };
}
