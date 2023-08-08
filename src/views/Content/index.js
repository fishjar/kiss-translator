import { useMemo, useState } from "react";
import LoadingIcon from "./LoadingIcon";
import {
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHTLIGHT,
  DEFAULT_COLOR,
} from "../../config";
import { useTranslate } from "../../hooks/Translate";

export default function Content({ q, rule }) {
  const [hover, setHover] = useState(false);
  const { text, sameLang, loading, textStyle, bgColor } = useTranslate(q, rule);

  const handleMouseEnter = () => {
    setHover(true);
  };

  const handleMouseLeave = () => {
    setHover(false);
  };

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
