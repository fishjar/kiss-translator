import { useLayoutEffect, useState } from "react";

const readViewport = () => ({
  x: window.visualViewport?.offsetLeft || 0,
  y: window.visualViewport?.offsetTop || 0,
  w:
    window.visualViewport?.width ||
    document.documentElement.clientWidth ||
    window.innerWidth,
  h:
    window.visualViewport?.height ||
    document.documentElement.clientHeight ||
    window.innerHeight,
});

export default function usePanelViewport() {
  const [viewport, setViewport] = useState(readViewport);
  useLayoutEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  return viewport;
}
