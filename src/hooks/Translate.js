import { useEffect } from "react";
import { useState } from "react";
import { tryDetectLang } from "../libs";
import { apiTranslate } from "../apis";

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
            q,
            fromLang,
            toLang,
            setting: setting[translator],
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
