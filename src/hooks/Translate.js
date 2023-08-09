import { useEffect } from "react";
import { useState } from "react";
import { transPool } from "../libs/pool";
import { detectLang } from "../libs";

/**
 * 翻译hook
 * @param {*} q
 * @param {*} rule
 * @returns
 */
export function useTranslate(q, rule) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sameLang, setSamelang] = useState(false);

  const { translator, fromLang, toLang } = rule;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const deLang = await detectLang(q);
        if (toLang.includes(deLang)) {
          setSamelang(true);
        } else {
          const [trText, isSame] = await transPool.push({
            translator,
            q,
            fromLang,
            toLang,
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
  }, [q, translator, fromLang, toLang]);

  return { text, sameLang, loading };
}
