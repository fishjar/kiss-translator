import { browser } from "../libs/browser";
import { isExt } from "../libs/client";
import { injectExternalJs, injectInlineJs } from "../libs/injector";
import { shadowRootInjector } from "./shadowroot";
import { XMLHttpRequestInjector } from "./xmlhttp";

export const INJECTOR = {
  subtitle: "injector-subtitle.js",
  shadowroot: "injector-shadowroot.js",
};

const injectorMap = {
  [INJECTOR.subtitle]: XMLHttpRequestInjector,
  [INJECTOR.shadowroot]: shadowRootInjector,
};

export function injectJs(name, id = "kiss-translator-inject-js") {
  const injector = injectorMap[name];
  if (!injector) return;

  if (isExt) {
    const src = browser.runtime.getURL(name);
    injectExternalJs(src, id);
  } else {
    injectInlineJs(`(${injector})()`, id);
  }
}
