import { useCallback, useEffect, useRef, useState } from "react";
import { patchCssProperty } from "./subtitleStyleUtils";

const STYLE_NAMES = ["originStyle", "translationStyle", "windowStyle"];

export function useSubtitleStyleEditor({
  originStyle,
  translationStyle,
  windowStyle,
  updateSubtitle,
}) {
  const [localStyles, setLocalStyles] = useState(() => ({
    originStyle,
    translationStyle,
    windowStyle,
  }));
  const cssRefs = useRef({
    originStyle,
    translationStyle,
    windowStyle,
  });
  const debounceTimers = useRef({});
  const pendingUpdates = useRef({});
  const animationFrames = useRef({});
  const updateSubtitleRef = useRef(updateSubtitle);
  updateSubtitleRef.current = updateSubtitle;

  const flushPendingUpdate = useCallback((name) => {
    if (!Object.prototype.hasOwnProperty.call(pendingUpdates.current, name)) {
      return;
    }

    if (debounceTimers.current[name]) {
      clearTimeout(debounceTimers.current[name]);
      delete debounceTimers.current[name];
    }

    const value = pendingUpdates.current[name];
    delete pendingUpdates.current[name];
    updateSubtitleRef.current({ [name]: value });
  }, []);

  const cancelPendingUpdate = useCallback((name) => {
    if (debounceTimers.current[name]) {
      clearTimeout(debounceTimers.current[name]);
      delete debounceTimers.current[name];
    }
    delete pendingUpdates.current[name];
  }, []);

  const syncStyleSource = useCallback(
    (name, value) => {
      if (!STYLE_NAMES.includes(name)) return;
      cancelPendingUpdate(name);
      cssRefs.current[name] = value;
      setLocalStyles((current) =>
        current[name] === value ? current : { ...current, [name]: value }
      );
    },
    [cancelPendingUpdate]
  );

  useEffect(() => {
    syncStyleSource("originStyle", originStyle);
  }, [originStyle, syncStyleSource]);
  useEffect(() => {
    syncStyleSource("translationStyle", translationStyle);
  }, [syncStyleSource, translationStyle]);
  useEffect(() => {
    syncStyleSource("windowStyle", windowStyle);
  }, [syncStyleSource, windowStyle]);

  const schedulePreview = useCallback((name, css) => {
    if (animationFrames.current[name]) {
      cancelAnimationFrame(animationFrames.current[name]);
    }
    animationFrames.current[name] = requestAnimationFrame(() => {
      delete animationFrames.current[name];
      setLocalStyles((current) => ({ ...current, [name]: css }));
    });
  }, []);

  const persistLater = useCallback(
    (name, value) => {
      if (debounceTimers.current[name]) {
        clearTimeout(debounceTimers.current[name]);
      }
      pendingUpdates.current[name] = value;
      debounceTimers.current[name] = setTimeout(
        () => flushPendingUpdate(name),
        200
      );
    },
    [flushPendingUpdate]
  );

  const updateCssProperty = useCallback(
    (name, property, value) => {
      const css = patchCssProperty(cssRefs.current[name], property, value);
      cssRefs.current[name] = css;
      schedulePreview(name, css);
      persistLater(name, css);
    },
    [persistLater, schedulePreview]
  );

  useEffect(
    () => () => {
      Object.values(animationFrames.current).forEach((frame) =>
        cancelAnimationFrame(frame)
      );
      Object.values(debounceTimers.current).forEach(clearTimeout);
      debounceTimers.current = {};
      Object.keys(pendingUpdates.current).forEach(flushPendingUpdate);
    },
    [flushPendingUpdate]
  );

  const updateOriginCss = useCallback(
    (property, value) => updateCssProperty("originStyle", property, value),
    [updateCssProperty]
  );
  const updateTranslationCss = useCallback(
    (property, value) => updateCssProperty("translationStyle", property, value),
    [updateCssProperty]
  );
  const updateWindowCss = useCallback(
    (property, value) => updateCssProperty("windowStyle", property, value),
    [updateCssProperty]
  );
  return {
    localOriginStyle: localStyles.originStyle,
    localTransStyle: localStyles.translationStyle,
    localWindowStyle: localStyles.windowStyle,
    syncStyleSource,
    updateOriginCss,
    updateTranslationCss,
    updateWindowCss,
  };
}
