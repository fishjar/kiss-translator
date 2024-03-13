import { useState, useEffect, useMemo } from "react";
import LoadingIcon from "./LoadingIcon";
import {
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
  OPT_STYLE_DIY,
  DEFAULT_COLOR,
  MSG_TRANS_CURRULE,
  TRANS_NEWLINE_LENGTH,
} from "../../config";
import { useTranslate } from "../../hooks/Translate";
import { styled } from "@mui/material/styles";

const Span = styled("span")``;

const LineSpan = styled(Span)`
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

const BlockquoteSpan = styled(Span)`
  opacity: 0.6;
  -webkit-opacity: 0.6;
  display: block;
  padding: 0 0.75em;
  border-left: 0.25em solid ${(props) => props.$lineColor};
  &:hover {
    opacity: 1;
    -webkit-opacity: 1;
  }
`;

const FuzzySpan = styled(Span)`
  filter: blur(0.2em);
  -webkit-filter: blur(0.2em);
  &:hover {
    filter: none;
    -webkit-filter: none;
  }
`;

const HighlightSpan = styled(Span)`
  color: #fff;
  background-color: ${(props) => props.$bgColor};
`;

const DiySpan = styled(Span)`
  ${(props) => props.$diyStyle}
`;

function StyledSpan({ textStyle, textDiyStyle, bgColor, children, ...props }) {
  switch (textStyle) {
    case OPT_STYLE_LINE: // 下划线
      return (
        <LineSpan $lineStyle="solid" $lineColor={bgColor} {...props}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_DOTLINE: // 点状线
      return (
        <LineSpan $lineStyle="dotted" $lineColor={bgColor} {...props}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_DASHLINE: // 虚线
      return (
        <LineSpan $lineStyle="dashed" $lineColor={bgColor} {...props}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_WAVYLINE: // 波浪线
      return (
        <LineSpan $lineStyle="wavy" $lineColor={bgColor} {...props}>
          {children}
        </LineSpan>
      );
    case OPT_STYLE_FUZZY: // 模糊
      return <FuzzySpan {...props}>{children}</FuzzySpan>;
    case OPT_STYLE_HIGHLIGHT: // 高亮
      return (
        <HighlightSpan $bgColor={bgColor || DEFAULT_COLOR} {...props}>
          {children}
        </HighlightSpan>
      );
    case OPT_STYLE_BLOCKQUOTE: // 引用
      return (
        <BlockquoteSpan $lineColor={bgColor || DEFAULT_COLOR} {...props}>
          {children}
        </BlockquoteSpan>
      );
    case OPT_STYLE_DIY: // 自定义
      return (
        <DiySpan $diyStyle={textDiyStyle} {...props}>
          {children}
        </DiySpan>
      );
    default:
      return <Span {...props}>{children}</Span>;
  }
}

export default function Content({ q, keeps, translator }) {
  const [rule, setRule] = useState(translator.rule);
  const { text, sameLang, loading } = useTranslate(q, rule, translator.setting);
  const { textStyle, bgColor = "", textDiyStyle = "" } = rule;

  const {
    newlineLength = TRANS_NEWLINE_LENGTH,
    transTag = "span",
    transOnly = false,
  } = translator.setting;

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

  const gap = useMemo(() => {
    if (transOnly) {
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
