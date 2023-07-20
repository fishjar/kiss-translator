import { useEffect } from "react";
import { useState } from "react";
import { apiTranslate } from "../apis";
import browser from "../libs/browser";
import {
  TRANS_MIN_LENGTH,
  TRANS_MAX_LENGTH,
  MSG_TRANS_PUTRULE,
  DEFAULT_FETCH_LIMIT,
  MSG_FETCH_LIMIT,
} from "../config";
import { useSetting } from "./Setting";
import { sendMsg } from "../libs/msg";
import { detectLang } from "../libs";

/**
 * 翻译hook
 * @param {*} q
 * @returns
 */
export function useTranslate(q, initRule) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sameLang, setSamelang] = useState(false);
  const [rule, setRule] = useState(initRule);
  const { fetchLimit = DEFAULT_FETCH_LIMIT } = useSetting() || {};

  const { translator, fromLang, toLang, textStyle } = rule;

  const handleMessage = ({ action, args }) => {
    if (action === MSG_TRANS_PUTRULE) {
      setRule((pre) => ({ ...pre, ...args }));
    }
    return true;
  };

  useEffect(() => {
    browser?.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser?.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    sendMsg(MSG_FETCH_LIMIT, { limit: fetchLimit });
  }, [fetchLimit]);

  useEffect(() => {
    (async () => {
      // 太长或太短不翻译
      if (q.length < TRANS_MIN_LENGTH || q.length > TRANS_MAX_LENGTH) {
        return;
      }

      try {
        setLoading(true);
        const deLang = await detectLang(q);
        if (toLang.includes(deLang)) {
          setSamelang(true);
        } else {
          const [trText, isSame] = await apiTranslate({
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

  return { text, sameLang, loading, textStyle };
}
