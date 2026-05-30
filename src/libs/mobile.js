/**
 * 自执行的移动端环境判定标志 (Boolean)。
 * 检测当前设备是否为 Android 手机/平板、iOS 设备 (iPhone/iPad/iPod) 或 iPad 桌面模式。
 */
export const isMobile = (() => {
  try {
    // 兼容可能无 navigator 对象的非浏览器沙盒环境 (如 Node.js 脚本或极简 Web Worker)
    if (typeof navigator === "undefined") return false;

    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isiOS = /iPhone|iPad|iPod/i.test(ua);

    // REVIEW: iPadOS 13+ 默认会伪装成桌面版浏览器，UA 包含 "Macintosh" 而非 "iPad"。
    // 此时通过联合校验 UA 包含 "Macintosh" 且物理屏幕最大触控点数 maxTouchPoints > 1
    // 可以精准判断出是 iPadOS 桌面模式，该设计非常有必要。
    const isiPadDesktop = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const isMobileDevice = isAndroid || isiOS || isiPadDesktop;

    return isMobileDevice;
  } catch (error) {
    return false; // 兜底返回 false
  }
})();
