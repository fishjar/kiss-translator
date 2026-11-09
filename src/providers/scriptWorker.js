import { providerHelpers } from "./sdk";
import Sval from "sval";
import { JSONParser } from "@streamparser/json";
import { createTranslationHelpers } from "./sdk/translation";
import { checkPayloadBudget } from "./validation";

// Capture only the channel needed by the runner, before loading Sval's globals.
const send = globalThis.postMessage.bind(globalThis);
const listen = globalThis.addEventListener.bind(globalThis);
const startHeartbeat = globalThis.setInterval.bind(globalThis);
const denied = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "WebTransport",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
  "MessageChannel",
  "indexedDB",
  "caches",
  "navigator",
  "chrome",
  "browser",
  "importScripts",
  "postMessage",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "onmessage",
  "onmessageerror",
  "setInterval",
  "clearInterval",
];

let sequence = 0;
const pending = new Map();
const rpc = (method, args) =>
  new Promise((resolve, reject) => {
    checkPayloadBudget(args);
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try {
      send({ type: "sdk", id, method, args });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });

function stream(request) {
  let streamId;
  let ended = false;
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      if (ended) return { done: true };
      if (streamId === undefined) streamId = await rpc("stream.start", request);
      const result = await rpc("stream.next", { streamId });
      ended = result.done;
      return result;
    },
    async return() {
      ended = true;
      if (streamId !== undefined) await rpc("stream.return", { streamId });
      return { done: true };
    },
  };
}

listen("message", async ({ data }) => {
  if (data.type === "reply") {
    const waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id);
    if (data.error)
      waiter.reject(
        Object.assign(new Error(data.error.message), { code: data.error.code })
      );
    else waiter.resolve(data.result);
    return;
  }
  if (data.type !== "start") return;
  // Captured before lockdown; interpreted code cannot stop or forge the host timer.
  startHeartbeat(() => send({ type: "heartbeat" }), 250);
  try {
    // A dedicated worker has no DOM; remove network/storage/channel shortcuts.
    // Failure to shadow any gate fails startup rather than weakening the runner.
    for (const name of denied)
      Object.defineProperty(globalThis, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    const interpreter = new Sval({
      ecmaVer: "latest",
      sourceType: "script",
      sandBox: true,
    });
    // Sval copies globals during module initialization. Shadow that copy too.
    interpreter.run("exports.__sandbox = globalThis");
    const sandbox = interpreter.exports.__sandbox;
    for (const name of denied)
      Object.defineProperty(sandbox, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    delete interpreter.exports.__sandbox;
    interpreter.run(data.code);
    const handler = interpreter.exports[data.handler];
    if (typeof handler !== "function")
      throw new Error("Script handler not found.");
    const ctx = {
      requestId: data.requestId,
      config: data.config,
      resources: data.resources || {},
      assets: { read: (ref) => rpc("asset.read", ref) },
      options: data.options,
      helpers: {
        ...providerHelpers,
        translation: {
          ...providerHelpers.translation,
          ...createTranslationHelpers(data.input, JSONParser),
        },
      },
      secrets: {
        ref: (key) => ({ scope: data.serviceId, key }),
        sign: (ref, options) => rpc("sign", { ref, options }),
      },
      http: { request: (request) => rpc("request", request), stream },
      emit: (event) => rpc("emit", event),
    };
    const result = await handler(data.input, data.config, ctx);
    checkPayloadBudget(result);
    send({ type: "result", result });
  } catch (error) {
    send({
      type: "error",
      error: {
        code: typeof error.code === "string" ? error.code : "SCRIPT_ERROR",
        message: String(error.message || error),
      },
    });
  }
});
