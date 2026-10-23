import { browser } from "./browser";
import { PORT_FETCH } from "../config/msg";

/** A request owns its port, so cancellation cannot affect another caller. */
export function fetchViaPort({ input, init = {}, opts = {} }, signal) {
  if (signal.aborted)
    return Promise.reject(
      new DOMException("The operation was aborted.", "AbortError")
    );
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: PORT_FETCH });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      try {
        port.disconnect();
      } catch {
        // The background may already have disconnected.
      }
      callback(value);
    };
    const abort = () =>
      finish(
        reject,
        new DOMException("The operation was aborted.", "AbortError")
      );
    const onMessage = (message) => {
      if (message.type === "result") finish(resolve, message.data);
      else if (message.type === "error")
        finish(
          reject,
          Object.assign(new Error(message.error), {
            name: message.name || "Error",
          })
        );
    };
    const onDisconnect = () =>
      finish(
        reject,
        new Error(
          browser.runtime.lastError?.message ||
            "Background request disconnected."
        )
      );
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      port.postMessage({
        action: "start",
        args: {
          input,
          init: { ...init, signal: undefined },
          opts: { ...opts, signal: undefined },
        },
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

/** Install cancellation before accepting the request, including port disconnects. */
export function handleFetchPort(port, fetchHandle) {
  const controller = new AbortController();
  let started = false;
  const disconnect = () => controller.abort();
  const safePost = (message) => {
    if (controller.signal.aborted) return;
    try {
      port.postMessage(message);
    } catch {
      // The port may be unusable before onDisconnect is delivered.
    }
  };
  const start = async (message) => {
    if (message.action !== "start" || started || controller.signal.aborted)
      return;
    started = true;
    try {
      const args = message.args;
      const data = await fetchHandle({
        ...args,
        opts: {
          ...args.opts,
          signal: controller.signal,
        },
      });
      safePost({ type: "result", data });
    } catch (error) {
      safePost({
        type: "error",
        error: error.message,
        name: error.name,
      });
    } finally {
      port.onMessage.removeListener(start);
      port.onDisconnect.removeListener(disconnect);
    }
  };
  port.onDisconnect.addListener(disconnect);
  port.onMessage.addListener(start);
}
