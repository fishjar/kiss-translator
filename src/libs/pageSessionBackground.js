import { normalizeRuleApi } from "./apiSelection";
import { getSettingWithDefault } from "./storage";
import { matchRule } from "./rules";
import { isInBlacklist } from "./blacklist";
import {
  SESSION_ACTIONS,
  SESSION_SNAPSHOT,
  SESSION_SELECTION,
  SESSION_EDITING,
  SESSION_FOCUS,
  createPageSession,
  reducePageSession,
  navigatePageSession,
  selectionPayload,
} from "./pageSession";
import {
  MSG_OPEN_TRANBOX,
  MSG_INPUT_TRANSLATE,
  STOKEY_SETTING,
} from "../config";

export async function loadPageSession(url, id, previous) {
  const setting = await getSettingWithDefault();
  const rule = await matchRule(url, setting);
  const state = previous
    ? navigatePageSession(previous, url, rule)
    : createPageSession(url, rule, setting, id);
  return {
    ...state,
    rule: normalizeRuleApi(state.rule, setting.transApis),
    blocked: isInBlacklist(url, setting.blacklist),
    blockedFeatures: {
      selection: isInBlacklist(url, setting.tranboxSetting?.blacklist),
      hover: isInBlacklist(url, setting.mouseHoverSetting?.blacklist),
      input: isInBlacklist(url, setting.inputRule?.blacklist),
    },
  };
}

export function createPageSessionBackend(browser) {
  const records = new Map();
  const queues = new Map();
  const key = (id) => `page-session:${id}`;
  const save = (id, record) =>
    browser.storage?.session?.set({ [key(id)]: record });
  async function recordFor(id) {
    if (!records.has(id)) {
      const stored = await browser.storage?.session?.get(key(id));
      records.set(id, stored?.[key(id)] || { documents: {}, state: null });
    }
    return records.get(id);
  }
  async function deliver(id, record, doc, action, args) {
    try {
      const response = await browser.tabs.sendMessage(
        id,
        {
          action,
          args,
          expectedDocumentToken: doc.token,
        },
        { frameId: doc.frameId }
      );
      if (response?.code === "STALE_DOCUMENT")
        throw new Error("Stale document");
      return response;
    } catch (_error) {
      if (record.documents[doc.frameId]?.token === doc.token)
        delete record.documents[doc.frameId];
      for (const field of ["focus", "selectionFocus"])
        if (record[field]?.token === doc.token) record[field] = null;
      return undefined;
    }
  }
  async function publish(id, record) {
    await save(id, record);
    await Promise.allSettled(
      Object.values(record.documents).map((doc) =>
        deliver(id, record, doc, SESSION_SNAPSHOT, record.state)
      )
    );
    await save(id, record);
  }
  async function handle(args = {}, sender = {}) {
    const id = sender.tab?.id ?? args.tabId;
    if (!Number.isInteger(id)) return undefined;
    const previous = queues.get(id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const record = await recordFor(id);
        if (args.kind === "register") {
          if (
            !sender.tab ||
            !Number.isInteger(sender.frameId) ||
            typeof args.token !== "string"
          )
            return;
          const doc = { frameId: sender.frameId, token: args.token };
          const oldTop = record.documents[0];
          if (doc.frameId === 0 && oldTop && oldTop.token !== doc.token) {
            record.state = null;
            record.documents = {};
            record.focus = null;
            record.selectionFocus = null;
          }
          record.documents[doc.frameId] = doc;
          const url =
            sender.frameId === 0
              ? sender.url
              : (await browser.tabs.get(id)).url;
          await save(id, record);
          if (url && (!record.state || record.state.url !== url)) {
            handle({
              kind: "initialize",
              tabId: id,
              url,
              topToken: record.documents[0]?.token,
            }).catch(() => {});
          }
          return record.state || { pending: true };
        }
        if (args.kind === "initialize") {
          if (record.state?.url === args.url) return record.state;
          if (record.documents[0]?.token !== args.topToken)
            return { pending: true };
          const initialized = await loadPageSession(
            args.url,
            record.state?.sessionId ||
              `${id}:${record.documents[0]?.token || Date.now()}`,
            record.state
          );
          if ((await browser.tabs.get(id)).url !== args.url)
            return { pending: true };
          record.state = initialized;
          await publish(id, record);
          return record.state;
        }
        if (args.kind === "reset") {
          record.state = null;
          record.documents = {};
          record.focus = null;
          record.selectionFocus = null;
          await save(id, record);
          return;
        }
        if (!record.state) return { pending: true };
        if (args.sessionId && args.sessionId !== record.state.sessionId)
          return { error: "Page session changed.", code: "STALE_DOCUMENT" };
        if (
          sender.tab &&
          record.documents[sender.frameId]?.token !== args.token
        )
          return { error: "Document changed.", code: "STALE_DOCUMENT" };
        if (args.kind === "refresh") {
          const tab = await browser.tabs.get(id);
          if (tab.url && (args.force || tab.url !== record.state.url)) {
            record.state = await loadPageSession(
              tab.url,
              record.state.sessionId,
              record.state
            );
            await publish(id, record);
          }
          return record.state;
        }
        if (args.kind === "query") return record.state;
        const action = args.action;
        if (action === SESSION_FOCUS) {
          const field = args.args?.selection ? "selectionFocus" : "focus";
          if (
            field === "selectionFocus" &&
            args.args?.enabled === false &&
            sender.frameId !== 0 &&
            record[field]?.token !== args.token
          )
            return record.state;
          record[field] =
            args.args?.enabled === false
              ? null
              : record.documents[sender.frameId];
          await save(id, record);
          return record.state;
        }
        if (action === "kiss_page_saved_rule" && sender.frameId === 0) {
          record.state = {
            ...record.state,
            rule: { ...args.args, ...record.state.overrides },
            revision: record.state.revision + 1,
          };
          await publish(id, record);
          return record.state;
        }
        if (action === SESSION_EDITING && sender.frameId !== 0)
          return { error: "Only the main document can edit rules." };
        if (SESSION_ACTIONS.has(action)) {
          if (record.state.editing && action !== SESSION_EDITING)
            return { error: "Page controls are paused while editing rules." };
          record.state = reducePageSession(record.state, action, args.args);
          await publish(id, record);
          return record.state;
        }
        if (action === SESSION_SELECTION || action === MSG_OPEN_TRANBOX) {
          const top = record.documents[0];
          if (!top || record.state.blocked || record.state.editing) return;
          if (
            action === MSG_OPEN_TRANBOX &&
            !args.args?.text &&
            record.selectionFocus?.frameId
          ) {
            return deliver(
              id,
              record,
              record.selectionFocus,
              MSG_OPEN_TRANBOX,
              { sessionLocal: true }
            );
          }
          return deliver(id, record, top, SESSION_SELECTION, {
            ...selectionPayload(args.args),
            fromFrame: sender.tab
              ? sender.frameId !== 0
              : args.args?.fromFrame === true,
          });
        }
        if (action === MSG_INPUT_TRANSLATE && record.focus) {
          return deliver(id, record, record.focus, action, {
            sessionLocal: true,
          });
        }
        return { error: "Unsupported page operation." };
      });
    queues.set(id, next);
    try {
      return await next;
    } finally {
      if (queues.get(id) === next) queues.delete(id);
    }
  }
  browser.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !changes[STOKEY_SETTING]) return;
    for (const [id, record] of records) {
      if (record.state && !record.state.editing)
        handle({ kind: "refresh", tabId: id, force: true }).catch(() => {});
    }
  });
  browser.tabs?.onRemoved?.addListener((id) => {
    records.delete(id);
    browser.storage?.session?.remove(key(id));
  });
  browser.webNavigation?.onCommitted?.addListener(({ tabId, frameId }) => {
    if (frameId === 0) handle({ kind: "reset", tabId }).catch(() => {});
  });
  const refreshRoute = ({ tabId, frameId }) => {
    if (frameId === 0) handle({ kind: "refresh", tabId }).catch(() => {});
  };
  browser.webNavigation?.onHistoryStateUpdated?.addListener(refreshRoute);
  browser.webNavigation?.onReferenceFragmentUpdated?.addListener(refreshRoute);
  return handle;
}
