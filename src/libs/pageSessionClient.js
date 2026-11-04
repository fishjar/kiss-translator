import { browser } from "./browser";
import { getPopupDocumentIdentity } from "./popupDocument";
import { loadPageSession } from "./pageSessionBackground";
import {
  SESSION_MESSAGE,
  SESSION_PROBE,
  SESSION_SNAPSHOT,
  SESSION_SELECTION,
  SESSION_FOCUS,
  SESSION_ACTIONS,
  SESSION_EDITING,
  reducePageSession,
  selectionPayload,
} from "./pageSession";
import { MSG_OPEN_TRANBOX, MSG_INPUT_TRANSLATE } from "../config";

const CHANNEL = "kiss-page-session-v1";
function descendants(root, visit) {
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    try {
      for (let n = 0; n < current.length; n++) {
        const child = current[n];
        if (visit(child)) return true;
        queue.push(child);
      }
    } catch (_error) {
      /* A frame can disappear during traversal. */
    }
  }
  return false;
}

export async function connectPageSession(isUserscript, onState, onLocal) {
  if (!isUserscript && !browser?.runtime?.sendMessage) return null;
  const identity = getPopupDocumentIdentity();
  const child = window !== window.top;
  let state;
  let port;
  let request = 0;
  const pending = new Map();
  const peers = new Map();
  let focus;
  let selectionFocus;
  let queue = Promise.resolve();
  const accept = (next) => {
    if (
      !next?.sessionId ||
      (state?.sessionId === next.sessionId && state.revision >= next.revision)
    )
      return;
    state = next;
    onState(next);
  };
  const local = (action, args) => onLocal?.(action, args);
  const deliver = async (action, args, target) => {
    if (!target) return local(action, args);
    const entry = Array.from(peers).find(([, peer]) => peer.port === target);
    if (!entry || !descendants(window, (frame) => frame === entry[0])) {
      if (entry) {
        entry[1].port.close();
        peers.delete(entry[0]);
      }
      if (focus === target) focus = undefined;
      if (selectionFocus === target) selectionFocus = undefined;
      return local(action, args);
    }
    target.postMessage({ action, args });
  };
  const publish = () => {
    onState(state);
    if (!peers.size) return;
    const live = new Set();
    descendants(window, (frame) => {
      live.add(frame);
      return false;
    });
    for (const [source, peer] of peers) {
      if (!live.has(source)) {
        peer.port.close();
        peers.delete(source);
        if (focus === peer.port) focus = undefined;
        if (selectionFocus === peer.port) selectionFocus = undefined;
      } else peer.port.postMessage({ action: SESSION_SNAPSHOT, args: state });
    }
  };
  async function command(action, args, source) {
    if (
      state?.blocked ||
      (state?.editing &&
        ![SESSION_EDITING, "kiss_page_saved_rule"].includes(action))
    )
      return;
    if (action === SESSION_FOCUS) {
      if (args?.selection) {
        if (args.enabled !== false || !source || selectionFocus === source)
          selectionFocus = args.enabled === false ? undefined : source;
      } else focus = args?.enabled === false ? undefined : source;
      return state;
    }
    if (action === "kiss_page_saved_rule" && !source) {
      state = {
        ...state,
        rule: { ...args, ...state.overrides },
        revision: state.revision + 1,
      };
      publish();
      return state;
    }
    if (action === SESSION_EDITING && source) return;
    if (SESSION_ACTIONS.has(action)) {
      state = reducePageSession(state, action, args);
      publish();
      return state;
    }
    if (action === SESSION_SELECTION || action === MSG_OPEN_TRANBOX) {
      if (action === MSG_OPEN_TRANBOX && !args?.text && selectionFocus)
        return deliver(
          MSG_OPEN_TRANBOX,
          { sessionLocal: true },
          selectionFocus
        );
      return local(SESSION_SELECTION, {
        ...selectionPayload(args),
        fromFrame: Boolean(source),
      });
    }
    if (action === MSG_INPUT_TRANSLATE)
      return deliver(action, { sessionLocal: true }, focus);
  }
  const send = async (action, args) => {
    if (!isUserscript)
      return browser.runtime.sendMessage({
        action: SESSION_MESSAGE,
        args: {
          kind: "command",
          action,
          args,
          token: identity.token,
          sessionId: state?.sessionId,
        },
      });
    if (!child) {
      const next = queue.then(() => command(action, args));
      queue = next.catch(() => {});
      return next;
    }
    if (!port) return undefined;
    const id = ++request;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(undefined);
      }, 5000);
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      port.postMessage({ id, action, args });
    });
  };
  let register;
  if (!isUserscript) {
    browser.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message.action === SESSION_PROBE) {
        respond({ token: identity.token, url: window.location.href });
        return false;
      }
      if (![SESSION_SNAPSHOT, SESSION_SELECTION].includes(message.action))
        return false;
      if (message.expectedDocumentToken !== identity.token) {
        respond({ code: "STALE_DOCUMENT" });
        return false;
      }
      if (message.action === SESSION_SNAPSHOT) accept(message.args);
      else local(message.action, message.args);
      respond({ ok: true });
      return false;
    });
    register = async () =>
      accept(
        await browser.runtime.sendMessage({
          action: SESSION_MESSAGE,
          args: { kind: "register", token: identity.token },
        })
      );
    await register();
  } else if (!child) {
    state = await loadPageSession(window.location.href, identity.token);
    onState(state);
    window.addEventListener("message", (event) => {
      if (
        event.data?.channel !== CHANNEL ||
        event.data?.kind !== "register" ||
        !event.ports[0]
      )
        return;
      if (!descendants(window, (candidate) => candidate === event.source))
        return;
      peers.get(event.source)?.port.close();
      const peer = { port: event.ports[0], token: event.data.token };
      peers.set(event.source, peer);
      peer.port.onmessage = (message) => {
        const data = message.data;
        if (!data || typeof data.id !== "number") return;
        queue = queue
          .then(async () => {
            if (
              !descendants(window, (candidate) => candidate === event.source)
            ) {
              peer.port.close();
              peers.delete(event.source);
              return;
            }
            const result = await command(data.action, data.args, peer.port);
            peer.port.postMessage({ id: data.id, result });
          })
          .catch(() => {});
      };
      peer.port.postMessage({ action: SESSION_SNAPSHOT, args: state });
    });
    register = () => {
      const next = queue.then(async () => {
        const url = window.location.href;
        if (state.url !== url) {
          const updated = await loadPageSession(url, state.sessionId, state);
          if (window.location.href === url) {
            state = updated;
            publish();
          }
        }
        descendants(window, (frame) => {
          frame.postMessage({ channel: CHANNEL, kind: "ready" }, "*");
          return false;
        });
      });
      queue = next.catch(() => {});
      return next;
    };
    await register();
  } else {
    register = () => {
      const channel = new MessageChannel();
      port?.close();
      port = channel.port1;
      port.onmessage = (event) => {
        if (event.data?.id) {
          pending.get(event.data.id)?.(event.data.result);
          pending.delete(event.data.id);
        } else if (event.data?.action === SESSION_SNAPSHOT)
          accept(event.data.args);
        else local(event.data?.action, event.data?.args);
      };
      window.top.postMessage(
        { channel: CHANNEL, kind: "register", token: identity.token },
        "*",
        [channel.port2]
      );
    };
    window.addEventListener("message", (event) => {
      if (
        event.source === window.top &&
        event.data?.channel === CHANNEL &&
        event.data.kind === "ready"
      )
        register();
    });
    register();
    [250, 1000, 3000].forEach((delay) =>
      setTimeout(() => {
        if (!state) register();
      }, delay)
    );
  }
  if (isUserscript && !child) {
    for (const method of ["pushState", "replaceState"]) {
      const original = window.history[method];
      window.history[method] = function (...args) {
        const result = original.apply(this, args);
        register();
        return result;
      };
    }
    window.addEventListener("popstate", () => register());
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) register();
  });
  return {
    send,
    register,
    get state() {
      return state;
    },
    token: identity.token,
  };
}
