import browser from "webextension-polyfill";
import { FILE_CHANNEL, isFileBridgePage } from "./fileTranslation/protocol";

if (window === window.top && isFileBridgePage(window.location.href)) {
  let port;
  let bridgeId;
  const post = (message) =>
    window.postMessage(
      {
        channel: FILE_CHANNEL,
        direction: "extension",
        extensionId: browser.runtime.id,
        bridgeId,
        ...message,
      },
      window.location.origin
    );
  const connect = () => {
    if (port) return;
    try {
      const nextPort = browser.runtime.connect({ name: FILE_CHANNEL });
      port = nextPort;
      bridgeId = crypto.randomUUID();
      nextPort.onMessage.addListener((message) => {
        if (port === nextPort) post(message);
      });
      nextPort.onDisconnect.addListener(() => {
        if (port !== nextPort) return;
        port = null;
        post({ type: "disconnected" });
      });
    } catch {
      post({ type: "disconnected" });
    }
  };
  const receive = ({ source, origin, data }) => {
    if (
      source !== window ||
      origin !== window.location.origin ||
      data?.channel !== FILE_CHANNEL ||
      data.direction !== "web"
    )
      return;
    if (data.type === "discover") {
      connect();
      if (port) post({ type: "available" });
    } else if (
      port &&
      data.extensionId === browser.runtime.id &&
      data.bridgeId === bridgeId
    ) {
      if (data.type === "disconnect") {
        port.disconnect();
        port = null;
      } else if (data.type === "request") port.postMessage(data.request);
    }
  };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", () => {
    port?.disconnect();
    port = null;
  });
}
