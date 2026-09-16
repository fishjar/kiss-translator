// Independently exercise production rule saving, transactions and WebDAV selection.
import { createClient } from "webdav";
import { saveRule } from "./rules";
import { storage, getRulesWithDefault, getSyncWithDefault } from "./storage";
import { browser } from "./browser";
import {
  saveFavoriteWordIfMissing,
  toggleFavoriteWord,
} from "../subtitle/favoriteWords";
import { persistSubtitlePosition } from "../subtitle/subtitle";
import { writeSiteRule } from "./ruleEditorStorage";
import { deriveRuleContext } from "./rules";
import { trySyncRules } from "./sync";
import { enqueueStorageSync } from "./storageState";
import {
  GLOBLA_RULE,
  KV_RULES_KEY,
  OPT_SYNCTYPE_WEBDAV,
  STOKEY_RULES,
  STOKEY_SYNC,
  STOKEY_WORDS,
  STOKEY_SETTING,
  STOKEY_RULESCACHE_PREFIX,
  STOKEY_DISABLED_SUB_RULES,
  KV_WORDS_KEY,
  KV_SETTING_KEY,
  EVENT_FAVORITE_WORD_CHANGE,
} from "../config";

jest.mock("./client", () => ({ isExt: true, isGm: false }));
jest.mock("./browser", () => ({
  isBg: () => true,
  isOptions: () => false,
  browser: {
    storage: {
      local: {
        get: async (keys) =>
          Object.fromEntries(
            keys.map((key) => [key, globalThis.localStorage.getItem(key)])
          ),
        set: async (entries) => {
          Object.entries(entries).forEach(([key, value]) => {
            globalThis.localStorage.setItem(key, value);
          });
        },
        remove: async (keys) => {
          keys.forEach((key) => globalThis.localStorage.removeItem(key));
        },
      },
    },
  },
}));
jest.mock("webextension-polyfill", () => ({}));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: () => ({ patch: jest.fn() }),
}));
jest.mock("./syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));
jest.mock("../subtitle/YouTubeCaptionProvider.js", () => ({
  YouTubeInitializer: jest.fn(),
}));
jest.mock("../injectors/index.js", () => ({
  injectJs: jest.fn(),
  INJECTOR: { subtitle: "subtitle" },
}));

const OLD_LOCAL_TIME = 90000;
const EDIT_TIME = 300000;
const INITIAL_RULES = [
  { ...GLOBLA_RULE },
  { pattern: "example.com", selector: "article", transOpen: "false" },
];
const REMOTE_RULES = [
  { ...GLOBLA_RULE },
  { pattern: "example.com", selector: ".remote", transOpen: "false" },
];
const EDITED_RULE = { pattern: "example.com", transOpen: "true" };
const siteRule = (rules) =>
  rules.find((rule) => rule.pattern === "example.com");
const packetRules = (packet) => JSON.parse(packet.value.slice(7));
const makePacket = (rules, updateAt) => ({
  key: KV_RULES_KEY,
  value: `cipher:${JSON.stringify(rules)}`,
  updateAt,
});

let remotePacket;
let remoteClient;

beforeEach(async () => {
  window.localStorage.clear();
  jest.spyOn(Date, "now").mockReturnValue(EDIT_TIME);
  createClient.mockReset();
  await storage.setObj(STOKEY_RULES, INITIAL_RULES);
  await storage.setObj(STOKEY_SYNC, {
    syncType: OPT_SYNCTYPE_WEBDAV,
    syncUrl: "https://sync.example.invalid",
    syncUser: "review-user",
    syncKey: "review-token",
    syncEncryptKey: "review-passphrase",
    syncMeta: { [KV_RULES_KEY]: { updateAt: OLD_LOCAL_TIME, syncAt: 90001 } },
  });
  remotePacket = makePacket(REMOTE_RULES, 200000);
  remoteClient = {
    exists: jest.fn(async () => true),
    getFileContents: jest.fn(async () => JSON.stringify(remotePacket)),
    putFileContents: jest.fn(async (_path, content) => {
      remotePacket = JSON.parse(content);
    }),
  };
  createClient.mockReturnValue(remoteClient);
});

afterEach(async () => {
  await enqueueStorageSync(STOKEY_RULES, async () => {});
  jest.restoreAllMocks();
});

async function readSyncedRules() {
  const local = await getRulesWithDefault();
  const meta = (await getSyncWithDefault()).syncMeta[KV_RULES_KEY];
  expect(meta.updateAt).toBeGreaterThanOrEqual(EDIT_TIME);
  return local;
}

test("a popup rule edit survives a remote version newer than old metadata but older than the edit", async () => {
  await saveRule(EDITED_RULE);
  // Await the real fire-and-forget sync initiated by saveRule without adding a retry.
  await enqueueStorageSync(STOKEY_RULES, async () => {});
  const local = await readSyncedRules();
  expect(siteRule(local)).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(siteRule(packetRules(remotePacket))).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(remotePacket.updateAt).toBeGreaterThanOrEqual(EDIT_TIME);
});

test("control: a remote timestamp below old metadata allows the popup edit to upload", async () => {
  remotePacket = makePacket(REMOTE_RULES, 80000);
  await saveRule(EDITED_RULE);
  await enqueueStorageSync(STOKEY_RULES, async () => {});
  const local = await readSyncedRules();
  expect(siteRule(local)).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(siteRule(packetRules(remotePacket))).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(remoteClient.putFileContents).toHaveBeenCalledTimes(1);
});

test("control: the existing atomic edit API retains an edit against the same newer remote", async () => {
  await storage.saveEdit(STOKEY_RULES, (previous) =>
    previous.map((rule) =>
      rule.pattern === "example.com" ? { ...rule, transOpen: "true" } : rule
    )
  );
  await trySyncRules();
  const local = await readSyncedRules();
  expect(siteRule(local)).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(siteRule(packetRules(remotePacket))).toMatchObject({
    selector: "article",
    transOpen: "true",
  });
  expect(remotePacket.updateAt).toBe(EDIT_TIME);
  expect(remoteClient.putFileContents).toHaveBeenCalledTimes(1);
});

test("concurrent favorite intents keep both words and duplicate automatic collection is a no-op", async () => {
  const events = jest.fn();
  document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, events);
  try {
    await expect(
      Promise.all([
        saveFavoriteWordIfMissing("first"),
        saveFavoriteWordIfMissing("second"),
      ])
    ).resolves.toEqual([true, true]);
    const words = await storage.getObj(STOKEY_WORDS);
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(Object.keys(words)).toEqual(["first", "second"]);
    await expect(
      saveFavoriteWordIfMissing("first", { definition: "ignored" })
    ).resolves.toBe(false);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(words);
    expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toEqual(
      metadata
    );
    expect(events).toHaveBeenCalledTimes(2);
    await expect(toggleFavoriteWord("first")).resolves.toBe(false);
    expect(Object.keys(await storage.getObj(STOKEY_WORDS))).toEqual(["second"]);
  } finally {
    document.removeEventListener(EVENT_FAVORITE_WORD_CHANGE, events);
  }
});

test("a failed favorite transaction does not publish success or keep a partial edit", async () => {
  const events = jest.fn();
  document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, events);
  const originalSet = browser.storage.local.set;
  const set = jest
    .spyOn(browser.storage.local, "set")
    .mockImplementation(async (entries) => {
      if (entries[STOKEY_SYNC]) throw new Error("metadata unavailable");
      return originalSet(entries);
    });
  try {
    await expect(saveFavoriteWordIfMissing("lost")).rejects.toThrow(
      "metadata unavailable"
    );
    expect(await storage.getObj(STOKEY_WORDS)).toBeNull();
    expect(events).not.toHaveBeenCalled();
  } finally {
    set.mockRestore();
    document.removeEventListener(EVENT_FAVORITE_WORD_CHANGE, events);
  }
});

test("subtitle position intents retain concurrent settings and the last requested position", async () => {
  await storage.setObj(STOKEY_SETTING, {
    darkMode: "light",
    subtitleSetting: { rememberPosition: true },
  });
  await Promise.all([
    persistSubtitlePosition(0.3),
    storage.saveEdit(STOKEY_SETTING, (setting) => ({
      ...setting,
      darkMode: "dark",
    })),
    persistSubtitlePosition(0.4),
  ]);
  expect(await storage.getObj(STOKEY_SETTING)).toEqual({
    darkMode: "dark",
    subtitleSetting: { rememberPosition: true, positionRatio: 0.4 },
  });
  expect(
    (await getSyncWithDefault()).syncMeta[KV_SETTING_KEY].updateAt
  ).toBeGreaterThanOrEqual(EDIT_TIME);
});

test("favorite edits after a first attempt preserve the pending upload marker", async () => {
  await storage.setObj(STOKEY_SYNC, {
    ...(await getSyncWithDefault()),
    syncMeta: {
      [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 0, firstAttemptAt: 100000 },
    },
  });
  await saveFavoriteWordIfMissing("retained");
  expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toMatchObject({
    updateAt: EDIT_TIME,
    syncAt: 0,
    firstAttemptAt: 100000,
    pendingUpload: true,
  });
});

test("the editor checks current inherited dependencies and preserves unrelated personal fields", async () => {
  const href = "https://example.com/story";
  const source = "https://rules.example.invalid/subscription";
  const subscription = [{ pattern: "example.com", selector: ".inherited" }];
  await storage.setObj(STOKEY_SETTING, {
    version: 3,
    injectRules: true,
    subrulesList: [{ selected: true, url: source }],
  });
  await storage.setObj(STOKEY_RULESCACHE_PREFIX + source, subscription);
  const initial = deriveRuleContext(href, {
    personalRules: INITIAL_RULES,
    subRules: subscription,
  });
  await storage.saveEdit(STOKEY_RULES, (rules) =>
    rules.map((rule) =>
      rule.pattern === "example.com"
        ? { ...rule, apiSlug: "new-service" }
        : rule
    )
  );
  const saved = await writeSiteRule({
    href,
    expected: initial.site,
    inherited: initial.inherited,
    patch: { selector: ".edited" },
  });
  expect(saved.site).toMatchObject({
    selector: ".edited",
    apiSlug: "new-service",
  });
  await enqueueStorageSync(STOKEY_RULES, async () => {});
  const beforeConflict = await storage.getObj(STOKEY_RULES);
  await storage.setObj(STOKEY_DISABLED_SUB_RULES, {
    [source]: ["example.com"],
  });
  await expect(
    writeSiteRule({
      href,
      expected: saved.site,
      inherited: saved.inherited,
      patch: { selector: ".stale" },
    })
  ).rejects.toThrow("rule-conflict");
  expect(await storage.getObj(STOKEY_RULES)).toEqual(beforeConflict);
});
