import { useMemo, useState } from "react";
import LoadingIcon from "./LoadingIcon";
import { OPT_STYLE_FUZZY, OPT_STYLE_LINE } from "../../config";
import { useTranslate } from "../../hooks/Translate";

export default function Content({ q, rule }) {
  const [hover, setHover] = useState(false);
  const { text, sameLang, loading, textStyle } = useTranslate(q, rule);

  const handleMouseEnter = () => {
    setHover(true);
  };

  const handleMouseLeave = () => {
    setHover(false);
  };

  const style = useMemo(() => {
    switch (textStyle) {
      case OPT_STYLE_LINE:
        return {
          opacity: hover ? 1 : 0.6,
          textDecoration: "dashed underline 2px",
          textUnderlineOffset: "0.3em",
        };
      case OPT_STYLE_FUZZY:
        return {
          filter: hover ? "none" : "blur(5px)",
          transition: "filter 0.3s ease-in-out",
        };
      default:
        return {};
    }
  }, [textStyle, hover]);

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
