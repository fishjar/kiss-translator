import { css, keyframes } from "@emotion/css";
import {
  OPT_STYLE_NONE,
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_DASHBOX,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
  OPT_STYLE_GRADIENT,
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_COLORFUL,
  DEFAULT_COLOR,
  OPT_STYLE_MARKER,
  OPT_STYLE_GRADIENT_MARKER,
  OPT_STYLE_DASHBOX_BOLD,
  OPT_STYLE_DASHLINE_BOLD,
  OPT_STYLE_WAVYLINE_BOLD,
} from "../config";

const gradientFlow = keyframes`
  to {
    background-position: 200% center;
  }
`;

const blink = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
`;

const glow = keyframes`
  from {
    text-shadow: 0 0 10px #fff, 
    0 0 20px #fff, 
    0 0 30px #0073e6, 
    0 0 40px #0073e6;
  }
  to {
    text-shadow: 0 0 20px #fff, 
    0 0 30px #ff4da6, 
    0 0 40px #ff4da6, 
    0 0 50px #ff4da6;
  }
`;

const genLineStyle = (style, color, thickness = 1) => `
  text-decoration-line: underline;
  text-decoration-style: ${style};
  text-decoration-color: ${color};
  text-decoration-thickness: ${thickness}px;
  text-underline-offset: 0.3em;
  -webkit-text-decoration-line: underline;
  -webkit-text-decoration-style: ${style};
  -webkit-text-decoration-color: ${color};
  -webkit-text-decoration-thickness: 1px;
  -webkit-text-underline-offset: 0.3em;

  opacity: 0.8;
  -webkit-opacity: 0.8;
  &:hover {
    opacity: 1;
    -webkit-opacity: 1;
  }
`;

const genBuiltinStyles = (color = DEFAULT_COLOR) => ({
  // 无样式
  [OPT_STYLE_NONE]: ``,
  // 下划线
  [OPT_STYLE_LINE]: genLineStyle("solid", color),
  // 点状线
  [OPT_STYLE_DOTLINE]: genLineStyle("dotted", color),
  // 虚线
  [OPT_STYLE_DASHLINE]: genLineStyle("dashed", color),
  // 虚线加粗
  [OPT_STYLE_DASHLINE_BOLD]: genLineStyle("dashed", color, 2),
  // 波浪线
  [OPT_STYLE_WAVYLINE]: genLineStyle("wavy", color),
  // 波浪线加粗
  [OPT_STYLE_WAVYLINE_BOLD]: genLineStyle("wavy", color, 2),
  // 虚线框
  [OPT_STYLE_DASHBOX]: `
    border: 1px dashed ${color};
    display: block;
    padding: 0.2em 0.3em;
    box-sizing: border-box;
  `,
  // 虚线框加粗
  [OPT_STYLE_DASHBOX_BOLD]: `
    border: 2px dashed ${color};
    display: block;
    padding: 0.2em 0.3em;
    box-sizing: border-box;
  `,
  // 马克笔
  [OPT_STYLE_MARKER]: `
    background: linear-gradient(to top, ${color} 50%, transparent 50%);
  `,
  // 渐变马克笔
  [OPT_STYLE_GRADIENT_MARKER]: `
    background: linear-gradient(to top, transparent, ${color} 20%, transparent 60%);
  `,
  // 模糊
  [OPT_STYLE_FUZZY]: `
    filter: blur(0.2em);
    -webkit-filter: blur(0.2em);
    &:hover {
      filter: none;
      -webkit-filter: none;
    }
  `,
  // 高亮
  [OPT_STYLE_HIGHLIGHT]: `
    color: #fff;
    background-color: ${color};
  `,
  // 引用
  [OPT_STYLE_BLOCKQUOTE]: `
    opacity: 0.8;
    -webkit-opacity: 0.8;
    display: block;
    padding: 0.25em 0.5em;
    border-left: 0.25em solid ${color};
    background: rgb(32, 156, 238, 0.2);
    &:hover {
      opacity: 1;
      -webkit-opacity: 1;
    }
  `,
  // 渐变
  [OPT_STYLE_GRADIENT]: `
    background-image: linear-gradient(
      90deg,
      #3b82f6,
      #9333ea,
      #ec4899,
      #3b82f6
    );
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: ${gradientFlow} 4s linear infinite;
  `,
  // 闪现
  [OPT_STYLE_BLINK]: `
    animation: ${blink} 1s infinite;
  `,
  // 发光
  [OPT_STYLE_GLOW]: `
    animation: ${glow} 2s ease-in-out infinite alternate;
  `,
  // 多彩
  [OPT_STYLE_COLORFUL]: `
    color: #333;
    background: linear-gradient(
      45deg,
      LightGreen 20%,
      LightPink 20% 40%,
      LightSalmon 40% 60%,
      LightSeaGreen 60% 80%,
      LightSkyBlue 80%
    );
    &:hover {
      color: #111;
    };
  `,
});

export const genTextClass = (customStyles = []) => {
  const styles = genBuiltinStyles();
  customStyles.forEach((style) => {
    styles[style.styleSlug] = style.styleCode;
  });

  const textClass = {};
  let textStyles = "";
  Object.entries(styles).forEach(([k, v]) => {
    textClass[k] = css`
      ${v}
    `;
  });
  Object.entries(styles).forEach(([k, v]) => {
    textStyles += `
      .${textClass[k]} {
        ${v}
      }
    `;
  });
  return [textClass, textStyles];
};

export const builtinStylesMap = genBuiltinStyles();
