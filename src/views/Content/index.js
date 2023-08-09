import { useMemo, useState, useEffect } from "react";
import LoadingIcon from "./LoadingIcon";
import {
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHTLIGHT,
  DEFAULT_COLOR,
  EVENT_KISS,
  MSG_TRANS_CURRULE,
} from "../../config";
import { useTranslate } from "../../hooks/Translate";

export default function Content({ q, translator }) {
  const [rule, setRule] = useState(translator.rule);
  const [hover, setHover] = useState(false);
  const { text, sameLang, loading } = useTranslate(q, rule);
  const { textStyle, bgColor } = rule;

  const handleMouseEnter = () => {
    setHover(true);
  };

  const handleMouseLeave = () => {
    setHover(false);
  };

  const handleKissEvent = (e) => {
    const { action, args } = e.detail;
    switch (action) {
      case MSG_TRANS_CURRULE:
        setRule(args);
        break;
      default:
      // console.log(`[popup] kissEvent action skip: ${action}`);
    }
  };

  useEffect(() => {
    window.addEventListener(EVENT_KISS, handleKissEvent);
    return () => {
      window.removeEventListener(EVENT_KISS, handleKissEvent);
    };
  }, []);

  const style = useMemo(() => {
    const lineColor = bgColor || "";
    switch (textStyle) {
      case OPT_STYLE_LINE: // 下划线
        return {
          opacity: hover ? 1 : 0.6,
          textDecoration: `underline 2px ${lineColor}`,
          textUnderlineOffset: "0.3em",
        };
      case OPT_STYLE_DOTLINE: // 点状线
        return {
          opacity: hover ? 1 : 0.6,
          textDecoration: `dotted underline 2px ${lineColor}`,
          textUnderlineOffset: "0.3em",
        };
      case OPT_STYLE_DASHLINE: // 虚线
        return {
          opacity: hover ? 1 : 0.6,
          textDecoration: `dashed underline 2px ${lineColor}`,
          textUnderlineOffset: "0.3em",
        };
      case OPT_STYLE_WAVYLINE: // 波浪线
        return {
          opacity: hover ? 1 : 0.6,
          textDecoration: `wavy underline 2px ${lineColor}`,
          textUnderlineOffset: "0.3em",
        };
      case OPT_STYLE_FUZZY: // 模糊
        return {
          filter: hover ? "none" : "blur(5px)",
          transition: "filter 0.2s ease-in-out",
        };
      case OPT_STYLE_HIGHTLIGHT: // 高亮
        return {
          color: "#FFF",
          backgroundColor: bgColor || DEFAULT_COLOR,
        };
      default:
        return {};
    }
  }, [textStyle, hover, bgColor]);

  if (loading) {
    return (
      <>
        {q.length > 40 ? <br /> : " "}
        <LoadingIcon />
      </>
    );
  }

  if (text && !sameLang) {
    return (
      <>
        {q.length > 40 ? <br /> : " "}
        <span
          style={style}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {text}
        </span>
      </>
    );
  }
}
