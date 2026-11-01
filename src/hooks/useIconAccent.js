import { useSyncExternalStore } from "react";
import {
  calculateAdaptivePrimaryFamily,
  getIconColorSnapshot,
  resolveIconHue,
  subscribeIconColor,
} from "../styles/m3";

// 图标强调色的恒浅口径单点：订阅 m3.js 图标色快照 store（零重依赖，不 import
// hooks/Setting），经 resolveIconHue 反解色相，取浅色家族深调主色
// （primary/onPrimary/primaryContainer/onPrimaryContainer）。区域框/角标/悬浮
// 线框层/悬浮操作栏等消费方刻意恒用 light 家族而非 theme.palette：白纸图片与
// 游离于 M3Theme 之外的 body 悬浮层需与页面明暗无关的可读深调主色（dark 亮调
// 对白纸不可读）。额外回传 hue，供个别消费方派生同色相深化档（如 hover）。
export function useIconAccent() {
  const iconColor = useSyncExternalStore(
    subscribeIconColor,
    getIconColorSnapshot
  );
  const hue = resolveIconHue(iconColor);
  const accent = calculateAdaptivePrimaryFamily(hue, "light");
  return { hue, accent };
}
