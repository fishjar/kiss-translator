import { css } from "@emotion/css";
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
  OPT_STYLE_DIY,
  DEFAULT_DIY_STYLE,
  DEFAULT_COLOR,
} from "../config";

const genLineStyle = (style, color) => `
  opacity: 0.8;
  -webkit-opacity: 0.8;
  text-decoration-line: underline;
  text-decoration-style: ${style};
  text-decoration-color: ${color};
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
  -webkit-text-decoration-line: underline;
  -webkit-text-decoration-style: ${style};
  -webkit-text-decoration-color: ${color};
  -webkit-text-decoration-thickness: 2px;
  -webkit-text-underline-offset: 0.3em;
  &:hover {
    opacity: 1;
    -webkit-opacity: 1;
  }
`;

const genStyles = ({
  textDiyStyle = DEFAULT_DIY_STYLE,
  bgColor = DEFAULT_COLOR,
} = {}) => ({
  // 无样式
  [OPT_STYLE_NONE]: ``,
  // 下划线
  [OPT_STYLE_LINE]: genLineStyle("solid", bgColor),
  // 点状线
  [OPT_STYLE_DOTLINE]: genLineStyle("dotted", bgColor),
  // 虚线
  [OPT_STYLE_DASHLINE]: genLineStyle("dashed", bgColor),
  // 波浪线
  [OPT_STYLE_WAVYLINE]: genLineStyle("wavy", bgColor),
  // 虚线框
  [OPT_STYLE_DASHBOX]: `
    border: 1px dashed ${bgColor || DEFAULT_COLOR};
    display: inline-block;
    padding: 0.2em 0.4em;
    box-sizing: border-box;
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
    background-color: ${bgColor || DEFAULT_COLOR};
  `,
  // 引用
  [OPT_STYLE_BLOCKQUOTE]: `
    opacity: 0.8;
    -webkit-opacity: 0.8;
    display: block;
    padding: 0.25em 0.5em;
    border-left: 0.5em solid ${bgColor || DEFAULT_COLOR};
    background: rgb(32, 156, 238, 0.2);
    &:hover {
      opacity: 1;
      -webkit-opacity: 1;
    }
  `,
  // 自定义
  [OPT_STYLE_DIY]: `
${textDiyStyle}
`,
});

export const genTextClass = ({ textDiyStyle, bgColor = DEFAULT_COLOR }) => {
  const styles = genStyles({ textDiyStyle, bgColor });
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

export const defaultStyles = genStyles();
