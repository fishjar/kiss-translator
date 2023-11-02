export const isIframe = window.self !== window.top;

export const sendIframeMsg = (action, args) => {
  document.getElementsByTagName("iframe").forEach((iframe) => {
    iframe.contentWindow.postMessage({ action, args }, "*");
  });
};

export const sendParentMsg = (action, args) => {
  window.parent.postMessage({ action, args }, "*");
};
