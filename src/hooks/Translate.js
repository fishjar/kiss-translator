import { useEffect } from "react";
import { useState } from "react";
import { transPool } from "../libs/pool";
import { browser } from "../libs/browser";
import { MSG_TRANS_PUTRULE, EVENT_KISS } from "../config";
import { detectLang } from "../libs";
import { isExt } from "../libs/browser";

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

  const { translator, fromLang, toLang, textStyle } = rule;

  const handleMessage = ({ action, args }) => {
    if (action === MSG_TRANS_PUTRULE) {
      setRule((pre) => ({ ...pre, ...args }));
    }
    return true;
  };

  const handleKissEvent = (e) => {
    const action = e?.detail?.action;
    const args = e?.detail?.args || {};
    switch (action) {
      case MSG_TRANS_PUTRULE:
        setRule((pre) => ({ ...pre, ...args }));
        break;
      default:
        // console.log(`[popup] kissEvent action skip: ${action}`);
    }
  };

  useEffect(() => {
    if (isExt) {
      browser?.runtime.onMessage.addListener(handleMessage);
    } else {
      window.addEventListener(EVENT_KISS, handleKissEvent);
    }

    return () => {
      if (isExt) {
        browser?.runtime.onMessage.removeListener(handleMessage);
      } else {
        window.removeEventListener(EVENT_KISS, handleKissEvent);
      }
    };
  }, []);

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

  return { text, sameLang, loading, textStyle };
}
