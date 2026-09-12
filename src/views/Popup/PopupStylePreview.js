import { ClassNames, keyframes } from "@emotion/react";
import {
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_GRADIENT,
} from "../../config/styles";

const popupGradientFlow = keyframes`
  to { background-position: 200% center; }
`;
const popupBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;
const popupGlow = keyframes`
  from {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff, 0 0 30px #0073e6,
      0 0 40px #0073e6;
  }
  to {
    text-shadow: 0 0 20px #fff, 0 0 30px #ff4da6, 0 0 40px #ff4da6,
      0 0 50px #ff4da6;
  }
`;
const popupPreviewAnimationStyles = {
  [OPT_STYLE_GRADIENT]: {
    animation: `${popupGradientFlow} 4s linear infinite`,
  },
  [OPT_STYLE_BLINK]: { animation: `${popupBlink} 1s infinite` },
  [OPT_STYLE_GLOW]: {
    animation: `${popupGlow} 2s ease-in-out infinite alternate`,
  },
};

export default function PopupStylePreview({ styleSlug, previewCode, label }) {
  return (
    <ClassNames>
      {({ css }) => (
        <span
          className={
            previewCode
              ? css(previewCode, popupPreviewAnimationStyles[styleSlug])
              : undefined
          }
        >
          {label}
        </span>
      )}
    </ClassNames>
  );
}
