import {
  createPageSession,
  reducePageSession,
  navigatePageSession,
  selectionPayload,
} from "./pageSession";
import {
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_ONLY,
  MSG_TRANS_PUTRULE,
  MSG_TRANSBOX_TOGGLE,
} from "../config";

const initial = () =>
  createPageSession(
    "https://main.test/a",
    {
      transOpen: "false",
      transOnly: "false",
      toLang: "zh-CN",
      selector: "#article",
    },
    { tranboxSetting: { transOpen: true } },
    "session-a"
  );

test("one toggle computes one explicit state for all documents", () => {
  const state = initial();
  const next = reducePageSession(state, MSG_TRANS_TOGGLE);
  expect(state.rule.transOpen).toBe("false");
  expect(next.rule.transOpen).toBe("true");
  expect(next.revision).toBe(2);
  expect(
    reducePageSession(next, MSG_TRANS_TOGGLE, { enabled: true }).rule.transOpen
  ).toBe("true");
});

test("translation-only enables the page and feature switches remain explicit", () => {
  const next = reducePageSession(initial(), MSG_TRANS_TOGGLE_ONLY);
  expect(next.rule).toMatchObject({ transOpen: "true", transOnly: "true" });
  expect(
    reducePageSession(next, MSG_TRANSBOX_TOGGLE, { enabled: false }).features
      .selection
  ).toBe(false);
});

test("SPA keeps user behavior overrides but replaces site selectors", () => {
  const changed = reducePageSession(initial(), MSG_TRANS_PUTRULE, {
    toLang: "en",
    selector: "#temporary",
  });
  const next = navigatePageSession(changed, "https://main.test/b", {
    toLang: "ja",
    selector: ".new-article",
  });
  expect(next.rule).toMatchObject({ toLang: "en", selector: ".new-article" });
  expect(next.sessionId).toBe(changed.sessionId);
});

test("selection messages preserve bounded context but cannot carry arbitrary settings", () => {
  const payload = selectionPayload({
    text: "hello",
    context: "a".repeat(2000),
    transApis: [{ key: "secret" }],
    selectionSource: { url: "https://child.test", sentence: "hello world" },
  });
  expect(payload.context).toHaveLength(1000);
  expect(payload.selectionSource).toMatchObject({
    text: "hello",
    url: "https://child.test",
  });
  expect(payload).not.toHaveProperty("transApis");
});
