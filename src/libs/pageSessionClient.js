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

export async function connectPageSession(isUserscript, onState, onLocal) {
  if (!isUserscript && !browser?.runtime?.sendMessage) return null;
  const identity = getPopupDocumentIdentity();
  let state;
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
  function command(action, args) {
    if (
      state?.blocked ||
      (state?.editing &&
        ![SESSION_EDITING, "kiss_page_saved_rule"].includes(action))
    )
      return;
    if (action === SESSION_FOCUS) return state;
    if (action === "kiss_page_saved_rule") {
      state = {
        ...state,
        rule: { ...args, ...state.overrides },
        revision: state.revision + 1,
      };
      onState(state);
      return state;
    }
    if (SESSION_ACTIONS.has(action)) {
      state = reducePageSession(state, action, args);
      onState(state);
      return state;
    }
    if (action === SESSION_SELECTION || action === MSG_OPEN_TRANBOX) {
      return local(SESSION_SELECTION, {
        ...selectionPayload(args),
        fromFrame: false,
      });
    }
    if (action === MSG_INPUT_TRANSLATE)
      return local(action, { sessionLocal: true });
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
    const next = queue.then(() => command(action, args));
    queue = next.catch(() => {});
    return next;
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
  } else {
    state = await loadPageSession(window.location.href, identity.token);
    onState(state);
    register = () => {
      const next = queue.then(async () => {
        const url = window.location.href;
        if (state.url !== url) {
          const updated = await loadPageSession(url, state.sessionId, state);
          if (window.location.href === url) {
            state = updated;
            onState(state);
          }
        }
      });
      queue = next.catch(() => {});
      return next;
    };
    await register();
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
