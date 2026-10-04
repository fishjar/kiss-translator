import { createContext, useContext, useEffect, useMemo, useRef } from "react";

export const SettingsSearchContext = createContext({ target: "" });
export const useSettingsSearchTarget = () =>
  useContext(SettingsSearchContext).target;

export function useRevealSearchTarget(setOpen, targets) {
  const { target, navigationKey } = useContext(SettingsSearchContext);
  const reveal = Boolean(target && (!targets || targets.includes(target)));
  useEffect(() => {
    if (reveal) setOpen(true);
  }, [target, navigationKey, setOpen, reveal]);
}

export function findSettingsSearchTarget(container, label) {
  const candidates = container.querySelectorAll(
    "label, .kt-settings-row__copy strong, h2, h3, button, a, [aria-label], .MuiTypography-root, .MuiButtonBase-root"
  );
  return Array.from(candidates).find((element) => {
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    return (
      element.getAttribute("aria-label") === label ||
      element.textContent.trim() === label
    );
  });
}

export default function SettingsSearchTarget({
  target,
  label,
  navigationKey,
  fallbackLabel,
  children,
}) {
  const pageRef = useRef(null);
  const searchContext = useMemo(
    () => ({ target, navigationKey }),
    [target, navigationKey]
  );
  useEffect(() => {
    const container = pageRef.current;
    if (!target || !label || !container) return undefined;
    let highlighted;
    let previousTabIndex;
    let frame;
    const observer = new MutationObserver(() => locate());
    function locate(allowFallback = false) {
      const element =
        findSettingsSearchTarget(container, label) ||
        (allowFallback && fallbackLabel
          ? findSettingsSearchTarget(container, fallbackLabel)
          : null);
      if (!element) return;
      observer.disconnect();
      clearTimeout(timeout);
      clearTimeout(fallbackTimeout);
      highlighted =
        element.closest(".kt-settings-row, .MuiFormControl-root") || element;
      previousTabIndex = highlighted.getAttribute("tabindex");
      highlighted.setAttribute("tabindex", "-1");
      highlighted.setAttribute("data-settings-search-target", target);
      frame = requestAnimationFrame(() => {
        highlighted.scrollIntoView?.({ block: "center", behavior: "instant" });
        highlighted.focus({ preventScroll: true });
      });
    }
    // Hooks and lazy advanced controls can finish rendering after navigation.
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    const fallbackTimeout = setTimeout(() => locate(true), 250);
    const timeout = setTimeout(() => observer.disconnect(), 5000);
    locate();
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      clearTimeout(fallbackTimeout);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (highlighted) {
        highlighted.removeAttribute("data-settings-search-target");
        if (previousTabIndex === null) highlighted.removeAttribute("tabindex");
        else highlighted.setAttribute("tabindex", previousTabIndex);
      }
    };
  }, [target, label, navigationKey, fallbackLabel]);

  return (
    <SettingsSearchContext.Provider value={searchContext}>
      <div className="kt-options-page" ref={pageRef}>
        {children}
      </div>
    </SettingsSearchContext.Provider>
  );
}
