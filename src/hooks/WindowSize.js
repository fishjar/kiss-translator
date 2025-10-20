import { useState, useEffect } from "react";
import { useDebouncedCallback } from "./DebouncedCallback";

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const debounceWindowResize = useDebouncedCallback(() => {
    setWindowSize({
      w: window.innerWidth,
      h: window.innerHeight,
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
