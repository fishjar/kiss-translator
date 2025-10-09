import { MSG_XHR_DATA_YOUTUBE } from "./config";

(function () {
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1];
    if (typeof url === "string" && url.includes("timedtext")) {
      this.addEventListener("load", function () {
        window.postMessage(
          {
            type: MSG_XHR_DATA_YOUTUBE,
            url: this.responseURL,
            response: this.responseText,
          },
          window.location.origin
        );
      });
    }
    return originalOpen.apply(this, args);
  };
})();
