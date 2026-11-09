import { injectExternalJs } from "./libs/injector";
import { browser } from "./libs/browser";

// Firefox MV2 installs the page-world bridge through its existing script adapter.
const install = () =>
  injectExternalJs(
    browser.runtime.getURL("injector-subtitle.js"),
    "kiss-translator-inject-subtitle-js"
  );
if (document.documentElement) install();
else {
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    install();
  });
  observer.observe(document, { childList: true });
}
