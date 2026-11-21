import { keyframes } from "@emotion/react";
import {
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_GRADIENT,
} from "../config/styles";

// 内置样式 compact 预览的动画 keyframes（gradient/blink/glow），与
// PopupStylePreview 同源形态：三个内置模板的 CSS 以 animation-name 引用
// 这些 keyframes，缺失即动画演示失真（演示 span 消费）。
export const previewGradientFlow = keyframes`
  to { background-position: 200% center; }
`;
export const previewBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;
export const previewGlow = keyframes`
  from {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #0073e6,
      0 0 40px #0073e6;
  }
  to {
    text-shadow: 0 0 20px #fff, 0 0 30px #ff4da6, 0 0 40px #ff4da6,
      0 0 50px #ff4da6;
  }
`;
export const PREVIEW_ANIMATION_STYLES = {
  [OPT_STYLE_GRADIENT]: {
    animation: `${previewGradientFlow} 4s linear infinite`,
  },
  [OPT_STYLE_BLINK]: { animation: `${previewBlink} 1s infinite` },
  [OPT_STYLE_GLOW]: {
    animation: `${previewGlow} 2s ease-in-out infinite alternate`,
  },
};
