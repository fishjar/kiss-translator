export const XMLHttpRequestInjector = () => {
  try {
    const emitTimedtext = (url, response) => {
      if (url && typeof response === "string") {
        window.postMessage(
          { type: "KISS_XHR_DATA_YOUTUBE", url, response },
          window.location.origin
        );
      }
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      const url = args[1];
      if (typeof url === "string" && url.includes("timedtext")) {
        this.addEventListener("load", function () {
          emitTimedtext(this.responseURL, this.responseText);
        });
      }
      return originalOpen.apply(this, args);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const input = args[0];
        const inputUrl = typeof input === "string" ? input : input?.url || "";
        const responseUrl = response?.url || inputUrl;
        if (responseUrl.includes("timedtext")) {
          response
            .clone()
            .text()
            .then((text) => emitTimedtext(responseUrl, text))
            .catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  } catch (err) {
    console.log("XMLHttpRequestInjector", err);
  }
};
