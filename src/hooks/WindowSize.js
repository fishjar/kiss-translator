import { useState, useEffect } from "react";
import { useDebouncedCallback } from "./DebouncedCallback";

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  });

  const debounceWindowResize = useDebouncedCallback(() => {
    setWindowSize({
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    });
  }, 200);

  useEffect(() => {
    debounceWindowResize();

    window.addEventListener("resize", debounceWindowResize);
    return () => {
      window.removeEventListener("resize", debounceWindowResize);
    };
  }, [debounceWindowResize]);

  return windowSize;
}

export default useWindowSize;
