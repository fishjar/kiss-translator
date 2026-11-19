import { frameRulePatch, readPageMessage } from "./pageMessages";
import {
  MSG_TRANS_PUTRULE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_OPEN_TRANBOX,
  MSG_TRANS_TOGGLE,
  MSG_RULE_EDITOR,
  GLOBAL_KEY,
} from "../config";

const setting = {
  transApis: [
    { apiSlug: "enabled" },
    { apiSlug: "disabled", isDisabled: true },
  ],
  customStyles: [{ styleSlug: "custom" }],
};

test.each([
  null,
  [],
  "message",
  {},
  { action: MSG_RULE_EDITOR },
  { action: MSG_TRANS_TOGGLE, args: { enabled: "true" } },
  { action: MSG_OPEN_TRANBOX, args: { text: {} } },
])("rejects malformed or privileged page messages: %j", (raw) => {
  expect(readPageMessage(raw, false, setting)).toBeUndefined();
});

test.each([
  { toLang: "fr", transStartHook: "args => args" },
  { toLang: "fr", transEndHook: "args => args" },
  { toLang: "fr", injectJs: "payload" },
  { apiSlug: "disabled" },
  { apiSlug: "unknown" },
  { textStyle: "unknown" },
  { isPlainText: {} },
  { autoScan: 1 },
  { toLang: {} },
  [],
  null,
])("rejects the entire unsafe iframe rule patch: %j", (args) => {
  expect(
    readPageMessage({ action: MSG_TRANS_PUTRULE, args }, true, setting)
  ).toBeUndefined();
});

test("retains the supported rule fields and inherited values", () => {
  const args = {
    fromLang: "auto",
    toLang: "fr",
    apiSlug: "enabled",
    textStyle: "custom",
    transOnly: "true",
    autoScan: GLOBAL_KEY,
    scanAll: false,
    hasRichText: "false",
    isPlainText: true,
  };
  expect(
    readPageMessage({ action: MSG_TRANS_PUTRULE, args }, true, setting)
  ).toEqual({ action: MSG_TRANS_PUTRULE, args });
  expect(
    frameRulePatch({ apiSlug: GLOBAL_KEY, textStyle: "style_none" }, setting)
  ).toEqual({ apiSlug: GLOBAL_KEY, textStyle: "style_none" });
  expect(
    readPageMessage({ action: MSG_TRANS_PUTRULE, args }, false, setting)
  ).toBeUndefined();
});

test("only forwards supported fields from trusted complete rules", () => {
  expect(
    frameRulePatch(
      { toLang: "fr", transStartHook: "secret script", injectJs: "secret" },
      setting,
      true
    )
  ).toEqual({ toLang: "fr" });
  expect(frameRulePatch({ injectJs: "secret" }, setting, true)).toBeUndefined();
});

test("frame touch messages can only turn the mode off", () => {
  for (const mode of ["tap", "swipe", {}, undefined]) {
    expect(
      readPageMessage(
        { action: MSG_TOUCH_TRANSLATE_MODE_SET, args: { mode } },
        true,
        setting
      )
    ).toBeUndefined();
  }
  expect(
    readPageMessage(
      {
        action: MSG_TOUCH_TRANSLATE_MODE_SET,
        args: { mode: "off", secret: "discard" },
      },
      true,
      setting
    )
  ).toEqual({ action: MSG_TOUCH_TRANSLATE_MODE_SET, args: { mode: "off" } });
});

test("snapshots permitted text without retaining page objects or internal flags", () => {
  let reads = 0;
  const raw = {
    action: MSG_OPEN_TRANBOX,
    expectedDocumentToken: "attacker",
    sourceDocument: { token: "attacker" },
    fromExt: true,
    args: {
      get text() {
        return ++reads === 1 ? "first" : "second";
      },
      secret: "discard",
    },
  };
  expect(readPageMessage(raw, false, setting)).toEqual({
    action: MSG_OPEN_TRANBOX,
    args: { text: "first" },
  });
  expect(reads).toBe(1);
});
