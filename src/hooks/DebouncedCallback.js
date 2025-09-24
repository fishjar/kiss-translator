import { useMemo, useEffect, useRef } from "react";
import { debounce } from "../libs/utils";

export function useDebouncedCallback(callback, delay) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useMemo(
    () => debounce((...args) => callbackRef.current(...args), delay),
    [delay]
  );

  return debouncedCallback;
}
