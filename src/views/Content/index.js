import { useState, useEffect } from "react";
import LoadingIcon from "./LoadingIcon";
import {
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_DIY,
  DEFAULT_COLOR,
  MSG_TRANS_CURRULE,
  TRANS_NEWLINE_LENGTH,
} from "../../config";
import { useTranslate } from "../../hooks/Translate";
import { styled } from "@mui/material/styles";

const LineSpan = styled("span")`
  opacity: 0.6;
  -webkit-opacity: 0.6;
  text-decoration-line: underline;
  text-decoration-style: ${(props) => props.$lineStyle};
  text-decoration-color: ${(props) => props.$lineColor};
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
  -webkit-text-decoration-line: underline;
  -webkit-text-decoration-style: ${(props) => props.$lineStyle};
  -webkit-text-decoration-color: ${(props) => props.$lineColor};
  -webkit-text-decoration-thickness: 2px;
  -webkit-text-underline-offset: 0.3em;
  &:hover {
    opacity: 1;
    -webkit-opacity: 1;
  }
`;

const FuzzySpan = styled("span")`
  filter: blur(0.2em);
  -webkit-filter: blur(0.2em);
  &:hover {
    filter: none;
    -webkit-filter: none;
  }
`;

const HighlightSpan = styled("span")`
  color: #fff;
  background-color: ${(props) => props.$bgColor};
`;

const DiySpan = styled("span")`
  ${(props) => props.$diyStyle}
`;

function StyledSpan({ textStyle, textDiyStyle, bgColor, children }) {
  switch (textStyle) {
    case OPT_STYLE_LINE: // 下划线
      return (
        <LineSpan $lineStyle="solid" $lineColor={bgColor}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_DOTLINE: // 点状线
      return (
        <LineSpan $lineStyle="dotted" $lineColor={bgColor}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_DASHLINE: // 虚线
      return (
        <LineSpan $lineStyle="dashed" $lineColor={bgColor}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_WAVYLINE: // 波浪线
      return (
        <LineSpan $lineStyle="wavy" $lineColor={bgColor}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_FUZZY: // 模糊
      return <FuzzySpan>{children}</FuzzySpan>;
    case OPT_STYLE_HIGHLIGHT: // 高亮
      return (
        <HighlightSpan $bgColor={bgColor || DEFAULT_COLOR}>
          {children}
        </HighlightSpan>
      );
    case OPT_STYLE_DIY: // 自定义
      return <DiySpan $diyStyle={textDiyStyle}>{children}</DiySpan>;
    default:
      return <span>{children}</span>;
  }
}

export default function Content({ q, translator }) {
  const [rule, setRule] = useState(translator.rule);
  const { text, sameLang, loading } = useTranslate(q, rule, translator.setting);
  const { textStyle, bgColor = "", textDiyStyle = "" } = rule;

  const { newlineLength = TRANS_NEWLINE_LENGTH } = translator.setting;

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

  if (loading) {
    return (
      <>
        {q.length > newlineLength ? <br /> : " "}
        <LoadingIcon />
      </>
    );
  }

  if (text && !sameLang) {
    return (
      <>
        {q.length > newlineLength ? <br /> : " "}
        <StyledSpan
          textStyle={textStyle}
          textDiyStyle={textDiyStyle}
          bgColor={bgColor}
        >
          {text}
        </StyledSpan>
      </>
    );
  }
}
