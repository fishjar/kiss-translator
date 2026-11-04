import { normalizeRuleApi } from "./apiSelection";
import { getSettingWithDefault } from "./storage";
import { matchRule } from "./rules";
import { isInBlacklist } from "./blacklist";
import {
  SESSION_ACTIONS,
  SESSION_PROBE,
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
  async function recordFor(id, create) {
    if (!records.has(id)) {
      const stored = await browser.storage?.session?.get(key(id));
      const record =
        stored?.[key(id)] ||
        (create ? { documents: {}, state: null } : undefined);
      if (record) records.set(id, record);
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
  async function publish(
    id,
    record,
    documents = Object.values(record.documents)
  ) {
    await save(id, record);
    await Promise.allSettled(
      documents.map((doc) =>
        deliver(id, record, doc, SESSION_SNAPSHOT, record.state)
      )
    );
    await save(id, record);
  }
  async function probe(id, frameId) {
    try {
      const doc = await browser.tabs.sendMessage(
        id,
        { action: SESSION_PROBE },
        { frameId }
      );
      if (typeof doc?.token === "string" && typeof doc.url === "string")
        return { frameId, token: doc.token, url: doc.url };
    } catch (_error) {
      // Navigation may have no injectable document yet.
    }
  }
  async function currentTop(id) {
    const doc = await probe(id, 0);
    const tab = await browser.tabs.get(id).catch(() => undefined);
    const top =
      doc && tab && !tab.pendingUrl && (!tab.url || tab.url === doc.url)
        ? doc
        : undefined;
    return { top, complete: !doc && tab?.status === "complete" };
  }
  function clearSession(record) {
    record.topToken = null;
    record.state = null;
    record.documents = {};
    record.focus = null;
    record.selectionFocus = null;
  }
  async function reconcile(id, record, { force, completed } = {}) {
    const { top, complete } = await currentTop(id);
    if (!top) {
      if (completed && complete) {
        clearSession(record);
        await save(id, record);
      }
      return false;
    }
    const sameDocument =
      (record.topToken || record.documents[0]?.token) === top.token;
    const previous = sameDocument ? record.state : null;
    const reload = !previous || force || previous.url !== top.url;
    const state = reload
      ? await loadPageSession(
          top.url,
          previous?.sessionId ||
            `${id}:${top.token}:${crypto.getRandomValues(new Uint32Array(4)).join("-")}`,
          previous
        )
      : previous;
    const pending = Object.values(record.pending || {});
    const verified = (
      await Promise.all(
        pending.map(async (doc) => {
          const active = doc.frameId === 0 ? top : await probe(id, doc.frameId);
          return active?.token === doc.token ? doc : null;
        })
      )
    ).filter(Boolean);
    if (reload || pending.length) {
      const { top: current } = await currentTop(id);
      if (current?.token !== top.token || current.url !== top.url) return false;
    }
    if (!sameDocument) clearSession(record);
    record.topToken = top.token;
    record.documents[0] = { frameId: 0, token: top.token };
    record.state = state;
    record.pending = {};
    for (const doc of verified) {
      const old = record.documents[doc.frameId];
      if (old && old.token !== doc.token) {
        for (const field of ["focus", "selectionFocus"])
          if (record[field]?.token === old.token) record[field] = null;
      }
      record.documents[doc.frameId] = doc;
    }
    if (reload || pending.length)
      await publish(id, record, reload ? undefined : verified);
    return true;
  }
  async function handle(args = {}, sender = {}) {
    const id = sender.tab?.id ?? args.tabId;
    if (!Number.isInteger(id)) return undefined;
    const previous = queues.get(id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const record = await recordFor(id, args.kind === "register");
        if (!record) return { pending: true };
        if (args.kind === "register") {
          if (
            !sender.tab ||
            !Number.isInteger(sender.frameId) ||
            typeof args.token !== "string"
          )
            return;
          const doc = { frameId: sender.frameId, token: args.token };
          record.pending ||= {};
          record.pending[doc.frameId] = doc;
          await save(id, record);
          handle({ kind: "refresh", tabId: id }).catch(() => {});
          return { pending: true };
        }
        if (!(await reconcile(id, record, args))) return { pending: true };
        if (args.sessionId && args.sessionId !== record.state.sessionId)
          return { error: "Page session changed.", code: "STALE_DOCUMENT" };
        if (
          sender.tab &&
          record.documents[sender.frameId]?.token !== args.token
        )
          return { error: "Document changed.", code: "STALE_DOCUMENT" };
        if (args.kind === "refresh" || args.kind === "query")
          return record.state;
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
  browser.tabs?.onUpdated?.addListener((tabId, change) => {
    const completed = change.status === "complete";
    if (change.url !== undefined || completed)
      handle({ kind: "refresh", tabId, completed }).catch(() => {});
  });
  return handle;
}
