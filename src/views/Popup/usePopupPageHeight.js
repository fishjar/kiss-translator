import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Measure the same page instance without exposing a hidden panel to users. */
export function measurePopupPageHeight(shell, chrome, page) {
  if (!shell || !chrome || !page) return null;
  const originalStyle = page.getAttribute("style");
  try {
    if (page.hidden) {
      page.style.setProperty("display", "block", "important");
      page.style.position = "absolute";
      page.style.visibility = "hidden";
      page.style.pointerEvents = "none";
      page.style.width = `${shell.getBoundingClientRect().width}px`;
      page.style.top = "0";
      page.style.left = "0";
    }
    const header = chrome.getBoundingClientRect().height;
    const body = page.getBoundingClientRect().height || page.scrollHeight;
    return header > 0 && body > 0 ? { height: header + body, header } : null;
  } finally {
    if (originalStyle === null) page.removeAttribute("style");
    else page.setAttribute("style", originalStyle);
  }
}

/** Keep the toolbar text frame tied to the page's intrinsic preferred height. */
export default function usePopupPageHeight({
  shellRef,
  chromeRef,
  pageRef,
  activeTab,
  isSeparate,
  generation,
  isLoading,
}) {
  const [reference, setReference] = useState(null);
  const pageScrollRef = useRef(null);
  const textScrollRef = useRef(0);
  const captureScrollPosition = useCallback(() => {
    const owner = shellRef.current?.ownerDocument;
    if (!owner || isSeparate) return;
    const position = owner.scrollingElement?.scrollTop || 0;
    if (owner.documentElement.classList.contains("kt-toolbar-popup--text"))
      textScrollRef.current = position;
    else pageScrollRef.current = position;
  }, [isSeparate, shellRef]);
  useLayoutEffect(() => {
    if (isSeparate) return undefined;
    const shell = shellRef.current;
    const chrome = chromeRef.current;
    const page = pageRef.current;
    if (!shell || !chrome || !page) return undefined;
    const viewport = shell.ownerDocument.defaultView;
    let frame;
    const measure = () => {
      frame = undefined;
      const next = measurePopupPageHeight(shell, chrome, page);
      if (next) {
        setReference((previous) =>
          previous &&
          Math.abs(previous.height - next.height) < 0.05 &&
          previous.header === next.header
            ? previous
            : next
        );
      }
    };
    const schedule = () => {
      if (frame === undefined) frame = viewport.requestAnimationFrame(measure);
    };
    measure();
    const resizeObserver =
      typeof viewport.ResizeObserver === "function"
        ? new viewport.ResizeObserver(schedule)
        : null;
    resizeObserver?.observe(page);
    resizeObserver?.observe(chrome);
    const mutationObserver = new viewport.MutationObserver(schedule);
    mutationObserver.observe(page, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    viewport.addEventListener("resize", schedule);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      viewport.removeEventListener("resize", schedule);
      if (frame !== undefined) viewport.cancelAnimationFrame(frame);
    };
  }, [
    shellRef,
    chromeRef,
    pageRef,
    activeTab,
    isSeparate,
    generation,
    isLoading,
  ]);

  useLayoutEffect(() => {
    const owner = shellRef.current?.ownerDocument;
    if (!owner || isSeparate) return;
    const root = owner.documentElement;
    const scrollingElement = owner.scrollingElement;
    const wasText = root.classList.contains("kt-toolbar-popup--text");
    const isText = activeTab === "text" && Boolean(reference);
    if (isText && !wasText) {
      if (pageScrollRef.current === null)
        pageScrollRef.current = scrollingElement?.scrollTop || 0;
      root.classList.add("kt-toolbar-popup--text");
      if (scrollingElement) scrollingElement.scrollTop = textScrollRef.current;
    } else if (!isText && wasText) {
      root.classList.remove("kt-toolbar-popup--text");
      if (scrollingElement)
        scrollingElement.scrollTop = pageScrollRef.current || 0;
    }
  }, [activeTab, isSeparate, reference, shellRef]);

  useLayoutEffect(() => {
    const owner = shellRef.current?.ownerDocument;
    if (!owner || isSeparate) return undefined;
    return () => {
      const root = owner.documentElement;
      if (root.classList.contains("kt-toolbar-popup--text")) {
        root.classList.remove("kt-toolbar-popup--text");
        if (owner.scrollingElement)
          owner.scrollingElement.scrollTop = pageScrollRef.current || 0;
      }
    };
  }, [isSeparate, shellRef]);

  return { reference, captureScrollPosition };
}
