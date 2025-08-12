import { useState, useEffect, useMemo } from "react";
import LoadingIcon from "./LoadingIcon";
import {
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_DASHBOX,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
  OPT_STYLE_DIY,
  DEFAULT_COLOR,
  MSG_TRANS_CURRULE,
} from "../../config";
import { useTranslate } from "../../hooks/Translate";
import { styled, css } from "@mui/material/styles";
import { APP_LCNAME } from "../../config";
import interpreter from "../../libs/interpreter";

const LINE_STYLES = {
  [OPT_STYLE_LINE]: "solid",
  [OPT_STYLE_DOTLINE]: "dotted",
  [OPT_STYLE_DASHLINE]: "dashed",
  [OPT_STYLE_WAVYLINE]: "wavy",
};

const StyledSpan = styled("span")`
  ${({ textStyle, textDiyStyle, bgColor }) => {
    switch (textStyle) {
      case OPT_STYLE_LINE: // 下划线
      case OPT_STYLE_DOTLINE: // 点状线
      case OPT_STYLE_DASHLINE: // 虚线
      case OPT_STYLE_WAVYLINE: // 波浪线
        return css`
          opacity: 0.6;
          -webkit-opacity: 0.6;
          text-decoration-line: underline;
          text-decoration-style: ${LINE_STYLES[textStyle]};
          text-decoration-color: ${bgColor};
          text-decoration-thickness: 2px;
          text-underline-offset: 0.3em;
          -webkit-text-decoration-line: underline;
          -webkit-text-decoration-style: ${LINE_STYLES[textStyle]};
          -webkit-text-decoration-color: ${bgColor};
          -webkit-text-decoration-thickness: 2px;
          -webkit-text-underline-offset: 0.3em;
          &:hover {
            opacity: 1;
            -webkit-opacity: 1;
          }
        `;
      case OPT_STYLE_DASHBOX: // 虚线框
        return css`
          color: ${bgColor || DEFAULT_COLOR};
          border: 1px dashed ${bgColor || DEFAULT_COLOR};
          background: transparent;
          display: block;
          padding: 5px 5px;
          box-sizing: border-box;
          white-space: normal;
          word-wrap: break-word;
          overflow-wrap: break-word;
          line-height: 1.4;
        `;
      case OPT_STYLE_FUZZY: // 模糊
        return css`
          filter: blur(0.2em);
          -webkit-filter: blur(0.2em);
          &:hover {
            filter: none;
            -webkit-filter: none;
          }
        `;
      case OPT_STYLE_HIGHLIGHT: // 高亮
        return css`
          color: #fff;
          background-color: ${bgColor || DEFAULT_COLOR};
        `;
      case OPT_STYLE_BLOCKQUOTE: // 引用
        return css`
          opacity: 0.6;
          -webkit-opacity: 0.6;
          display: block;
          padding: 0 0.75em;
          border-left: 0.25em solid ${bgColor || DEFAULT_COLOR};
          &:hover {
            opacity: 1;
            -webkit-opacity: 1;
          }
        `;
      case OPT_STYLE_DIY: // 自定义
        return textDiyStyle;
      default:
        return ``;
    }
  }}
`;

export default function Content({ q, keeps, translator, $el }) {
  const [rule, setRule] = useState(translator.rule);
  const { text, sameLang, loading } = useTranslate(q, rule, translator.setting);
  const {
    transOpen,
    textStyle,
    bgColor,
    textDiyStyle,
    transOnly,
    transTag,
    transEndHook,
  } = rule;

  const { newlineLength } = translator.setting;

  const handleKissEvent = (e) => {
    const { action, args } = e.detail;
    switch (action) {
      case MSG_TRANS_CURRULE:
        setRule(args);
        break;
      default:
    }
  };

  useEffect(() => {
    window.addEventListener(translator.eventName, handleKissEvent);
    return () => {
      window.removeEventListener(translator.eventName, handleKissEvent);
    };
  }, [translator.eventName]);

  useEffect(() => {
    // 运行钩子函数
    if (text && transEndHook?.trim()) {
      interpreter.run(`exports.transEndHook = ${transEndHook}`);
      interpreter.exports.transEndHook($el, q, text, keeps);
    }
  }, [$el, q, text, keeps, transEndHook]);

  const gap = useMemo(() => {
    if (transOnly === "true") {
      return "";
    }
    return q.length >= newlineLength ? <br /> : " ";
  }, [q, transOnly, newlineLength]);

  const styles = useMemo(
    () => ({
      textStyle,
      textDiyStyle,
      bgColor,
      as: transTag,
    }),
    [textStyle, textDiyStyle, bgColor, transTag]
  );

  if (loading) {
    return (
      <>
        {gap}
        <LoadingIcon />
      </>
    );
  }

  if (!text || sameLang) {
    return;
  }

  if (
    transOnly === "true" &&
    transOpen === "true" &&
    $el.querySelector(APP_LCNAME)
  ) {
    Array.from($el.childNodes).forEach((el) => {
      if (el.localName !== APP_LCNAME) {
        el.remove();
      }
    });
  }

  if (keeps.length > 0) {
    return (
      <>
        {gap}
        <StyledSpan
          {...styles}
          dangerouslySetInnerHTML={{
            __html: text.replace(/\[(\d+)\]/g, (_, p) => keeps[parseInt(p)]),
          }}
        />
      </>
    );
  }

  return (
    <>
      {gap}
      <StyledSpan {...styles}>{text}</StyledSpan>
    </>
  );
}
