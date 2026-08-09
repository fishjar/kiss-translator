import { useEffect, useState } from "react";

function readMediaQuery(query, fallback) {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : fallback;
}

export function useMediaQueryMatch(query, fallback = false) {
  const [matches, setMatches] = useState(() => readMediaQuery(query, fallback));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) =>
      setMatches(event?.matches ?? mediaQuery.matches);

    handleChange(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener?.(handleChange);
    return () => mediaQuery.removeListener?.(handleChange);
  }, [query]);

  return matches;
}
