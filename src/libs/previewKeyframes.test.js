import {
  OPT_STYLE_BLINK,
  OPT_STYLE_GLOW,
  OPT_STYLE_GRADIENT,
} from "../config/styles";
import {
  PREVIEW_ANIMATION_STYLES,
  previewBlink,
  previewGlow,
  previewGradientFlow,
} from "./previewKeyframes";

describe("previewKeyframes shared module", () => {
  test("registers the three built-in template animations", () => {
    // 内置模板的 CSS 以 animation-name 引用这些 keyframes（emotion 注入
    // 动画名 .name），关键帧体逐项锁定——任一缺失/漂移即 compact 预览
    // 的动画演示失真
    expect(previewGradientFlow.name).toBeTruthy();
    expect(previewGradientFlow.styles).toContain(
      "to { background-position: 200% center; }"
    );
    expect(previewBlink.name).toBeTruthy();
    expect(previewBlink.styles).toContain("50% { opacity: 0; }");
    expect(previewGlow.name).toBeTruthy();
    expect(previewGlow.styles).toContain("text-shadow");
  });

  test("maps every built-in animation option to its animation style", () => {
    // 消费方按 styleSlug 直取映射：键位须与内置动画档位一一对应（缺失键
    // 即该档位演示回退为无动画）；animation 引用对应 keyframes 名并保留
    // 既有节奏（gradient 4s linear / blink 1s / glow 2s ease-in-out alternate）
    expect(Object.keys(PREVIEW_ANIMATION_STYLES).sort()).toEqual(
      [OPT_STYLE_BLINK, OPT_STYLE_GLOW, OPT_STYLE_GRADIENT].sort()
    );
    expect(PREVIEW_ANIMATION_STYLES[OPT_STYLE_GRADIENT].animation).toBe(
      `${previewGradientFlow} 4s linear infinite`
    );
    expect(PREVIEW_ANIMATION_STYLES[OPT_STYLE_BLINK].animation).toBe(
      `${previewBlink} 1s infinite`
    );
    expect(PREVIEW_ANIMATION_STYLES[OPT_STYLE_GLOW].animation).toBe(
      `${previewGlow} 2s ease-in-out infinite alternate`
    );
  });
});
