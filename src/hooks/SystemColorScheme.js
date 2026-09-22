import { useMediaQueryMatch } from "./MediaQuery";

export function useSystemDarkPreference() {
  return useMediaQueryMatch("(prefers-color-scheme: dark)");
}
