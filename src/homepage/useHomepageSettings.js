import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LANG_STORAGE_KEY,
  THEME_STORAGE_KEY,
  homepageContent,
} from "./content";

const readStorage = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the homepage should still be usable.
  }
};

const getInitialTheme = () => {
  const stored = readStorage(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) {
    return "light";
  }

  return "dark";
};

export const useHomepageSettings = () => {
  const [language, setLanguageState] = useState(() => {
    const stored = readStorage(LANG_STORAGE_KEY);
    return homepageContent[stored] ? stored : "en";
  });
  const [themeMode, setThemeModeState] = useState(getInitialTheme);

  const setLanguage = useCallback((value) => {
    if (!homepageContent[value]) return;
    setLanguageState(value);
    writeStorage(LANG_STORAGE_KEY, value);
  }, []);

  const setThemeMode = useCallback((value) => {
    setThemeModeState(value);
    writeStorage(THEME_STORAGE_KEY, value);
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode(themeMode === "dark" ? "light" : "dark");
  }, [setThemeMode, themeMode]);

  useEffect(() => {
    document.documentElement.lang = language.replace("_", "-");
  }, [language]);

  return useMemo(
    () => ({
      language,
      setLanguage,
      themeMode,
      toggleThemeMode,
    }),
    [language, setLanguage, themeMode, toggleThemeMode]
  );
};
