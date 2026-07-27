import { useEffect, useState } from "react";

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function isVideoFullscreenElement(element) {
  if (!element) {
    return false;
  }

  if (element.tagName === "VIDEO") {
    return true;
  }

  return Boolean(element.querySelector?.("video"));
}

/**
 * 检测当前页面中的视频是否处于全屏状态。
 * 仅在 video 元素本身或其容器进入全屏时返回 true，
 * 不把浏览器自身的 F11 全屏误判为视频全屏。
 * @returns {{ isVideoFullscreen: boolean }}
 */
export function useFullscreenDetect() {
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const element = getFullscreenElement();
      setIsVideoFullscreen(isVideoFullscreenElement(element));
    };

    handleFullscreenChange();

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  return { isVideoFullscreen };
}
