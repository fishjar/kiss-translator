export const isMobile = (() => {
  try {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    // iPadOS 13+ requests desktop site by default
    const isiPadDesktop = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const isMobileDevice = isAndroid || isiOS || isiPadDesktop;

    return isMobileDevice;
  } catch (error) {
    return false;
  }
})();
