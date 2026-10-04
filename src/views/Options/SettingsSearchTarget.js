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

export function findSettingsSearchTarget(container, label, target = "") {
  const visible = (element) =>
    !element.closest('[hidden], [aria-hidden="true"]');
  // A stable key disambiguates translated labels and lets custom panels opt in
  // without depending on their internal markup.
  if (target) {
    const explicit = Array.from(
      container.querySelectorAll("[data-settings-search-id]")
    ).find(
      (element) =>
        element.getAttribute("data-settings-search-id") === target &&
        visible(element)
    );
    if (explicit) return explicit;
  }
  const candidates = container.querySelectorAll(
    "label, .kt-settings-row__copy strong, h2, h3, button, a, [aria-label], .MuiTypography-root, .MuiButtonBase-root"
  );
  return Array.from(candidates).find((element) => {
    if (!visible(element)) return false;
    return (
      element.getAttribute("aria-label") === label ||
      element.textContent.trim() === label
    );
  });
}

export function getSettingsSearchHighlight(element) {
  const row = element.closest(".kt-settings-row");
  if (row) return row;
  const control = element.closest(
    "[data-settings-search-id], [data-settings-search-scope], .MuiFormControl-root, .MuiFormControlLabel-root"
  );
  if (control) return control;
  if (element.closest(".MuiAccordionSummary-root"))
    return element.closest(".MuiAccordion-root") || element;
  if (element.matches("h2, h3"))
    return element.closest("section, .MuiCard-root") || element;
  return element;
}

export function getSettingsSearchShape(element) {
  return element.closest(
    ".kt-settings-row, .kt-overview-settings > .MuiGrid-container > .MuiGrid-item"
  )
    ? "row"
    : "panel";
}

export function getSettingsSearchRadius(element) {
  const style = getComputedStyle(element);
  const override = style.getPropertyValue("--kt-settings-search-radius").trim();
  if (override) return override;
  // List rows meet their neighbors at square edges. The enclosing card clips
  // the first and last rows to its outer corners.
  if (getSettingsSearchShape(element) === "row") return "0px";
  const readRadius = (computed) => {
    const corners = [
      computed.borderTopLeftRadius,
      computed.borderTopRightRadius,
      computed.borderBottomRightRadius,
      computed.borderBottomLeftRadius,
    ].map((value) => (value || "0px").split(/\s+/));
    if (
      !corners.some((values) => values.some((value) => parseFloat(value) > 0))
    )
      return "";
    return `${corners.map(([x]) => x).join(" ")} / ${corners
      .map(([x, y]) => y || x)
      .join(" ")}`;
  };
  // FormControl includes helper text but its visible shape belongs to the
  // direct input child. Do not borrow a nested control's radius for a panel.
  const input = Array.from(element.children).find((child) =>
    child.matches(".MuiInputBase-root")
  );
  return (
    readRadius(style) ||
    (input && readRadius(getComputedStyle(input))) ||
    "12px"
  );
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
    let previousRadius;
    let frame;
    const observer = new MutationObserver(() => locate());
    function locate(allowFallback = false) {
      if (highlighted) return;
      const element =
        findSettingsSearchTarget(container, label, target) ||
        (allowFallback && fallbackLabel
          ? findSettingsSearchTarget(container, fallbackLabel)
          : null);
      if (!element) return;
      observer.disconnect();
      clearTimeout(timeout);
      clearTimeout(fallbackTimeout);
      highlighted = getSettingsSearchHighlight(element);
      previousRadius = [
        highlighted.style.getPropertyValue("--kt-settings-search-radius"),
        highlighted.style.getPropertyPriority("--kt-settings-search-radius"),
      ];
      highlighted.style.setProperty(
        "--kt-settings-search-radius",
        getSettingsSearchRadius(highlighted)
      );
      previousTabIndex = highlighted.getAttribute("tabindex");
      // Preserve positioned controls; only static wrappers need a containing
      // block for the highlight layer. This also flushes a previous animation
      // before another click on the same search result starts it again.
      const position = getComputedStyle(highlighted).position;
      if (!position || position === "static")
        highlighted.setAttribute("data-settings-search-positioned", "");
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
        highlighted.removeAttribute("data-settings-search-positioned");
        if (previousRadius[0])
          highlighted.style.setProperty(
            "--kt-settings-search-radius",
            ...previousRadius
          );
        else highlighted.style.removeProperty("--kt-settings-search-radius");
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
