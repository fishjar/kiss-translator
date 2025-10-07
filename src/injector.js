import {
  MSG_XHR_DATA_YOUTUBE,
  MSG_GLOBAL_VAR_FETCH,
  MSG_GLOBAL_VAR_BACK,
} from "./config";

// 响应window全局对象查询
(function () {
  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.data &&
      event.data.type === MSG_GLOBAL_VAR_FETCH
    ) {
      const { varName, requestId } = event.data;
      if (varName) {
        const value = window[varName];
        window.postMessage(
          {
            type: MSG_GLOBAL_VAR_BACK,
            payload: value,
            requestId: requestId,
          },
          window.location.origin
        );
      }
    }
  });
})();

// 拦截字幕数据
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
