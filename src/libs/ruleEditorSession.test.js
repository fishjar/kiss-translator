import { RuleEditorSession } from "./ruleEditorSession";
import { selectorCandidates } from "./ruleEditorDom";
import { resolveRuleContext } from "./rules";
import { saveSiteRule } from "./ruleEditorStorage";
import { DEFAULT_RULE, GLOBLA_RULE } from "../config";
import { getRulesWithDefault } from "./storage";

jest.mock("./storage", () => ({ getRulesWithDefault: jest.fn() }));

jest.mock("./rules", () => ({
  hostnamePattern: (href) => `hostname:${new URL(href).hostname}`,
  resolveRuleContext: jest.fn(),
  findMatchingRule: (rules) =>
    rules.find((rule) => rule.pattern !== "*") || null,
}));
jest.mock("./ruleEditorStorage", () => ({ saveSiteRule: jest.fn() }));
jest.mock("./ruleEditorDom", () => ({
  ...jest.requireActual("./ruleEditorDom"),
  RuleHighlights: class {
    show = jest.fn();
    destroy = jest.fn();
  },
}));

let session, translator, context;
beforeEach(async () => {
  jest.useFakeTimers();
  document.body.innerHTML =
    '<main><a href="/away" class="story">Article one</a><p class="story">Article two</p></main>';
  context = {
    effective: { ...GLOBLA_RULE, selector: ".story", autoScan: "false" },
    inherited: { ...GLOBLA_RULE },
    personal: null,
    site: null,
    global: { ...GLOBLA_RULE },
    subscription: null,
  };
  resolveRuleContext.mockResolvedValue(context);
  translator = {
    setting: {},
    beginRuleEditing: jest.fn(() => ({ enabled: false })),
    endRuleEditing: jest.fn(),
    setRuleEditingPreview: jest.fn(),
    updateRule: jest.fn(),
    previewRule: () => ({
      targets: Array.from(document.querySelectorAll(".story")),
    }),
    ruleRangeContext: () => ({
      roots: [document.body],
      ignoreSelector: ".excluded",
    }),
  };
  saveSiteRule.mockImplementation(async ({ patch }) => {
    context = {
      ...context,
      effective: { ...context.effective, ...patch },
      site: {
        ...DEFAULT_RULE,
        ...context.site,
        ...patch,
        pattern: "hostname:localhost",
      },
    };
    return context;
  });
  session = new RuleEditorSession({ translator, onExit: jest.fn() });
  await session.start();
});
afterEach(() => {
  session.dispose();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test("picking cancels link clicks, locks an element and highlights every candidate match", () => {
  const link = document.querySelector("a");
  const pageHandler = jest.fn();
  link.addEventListener("click", pageHandler);
  session.pick();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  expect(link.dispatchEvent(click)).toBe(false);
  expect(click.defaultPrevented).toBe(true);
  expect(pageHandler).not.toHaveBeenCalled();
  expect(session.state.selected).toBe(link);
  expect(session.state.ancestors).toContain(document.querySelector("main"));
  session.setInput(".story");
  session.refresh();
  expect(session.state.matches).toHaveLength(2);
  expect(session.highlights.show).toHaveBeenLastCalledWith(
    expect.arrayContaining([{ element: link, excluded: false }])
  );
});

test("candidates include the selected element and never copy text, links or input values", () => {
  const link = document.querySelector("a");
  link.id = "title:with,comma";
  link.href = "https://example.com/?private=do-not-copy";
  const candidates = selectorCandidates(link);
  expect(candidates.length).toBeGreaterThan(2);
  for (const candidate of candidates) {
    expect(Array.from(document.querySelectorAll(candidate.selector))).toContain(
      link
    );
    expect(candidate.selector).not.toMatch(/do-not-copy|Article one|private/);
  }
});

test("candidates stay ordered by match count after the page changes", async () => {
  session.selectElement(document.querySelector("a"));
  const expectSorted = () => {
    const counts = session.state.candidates.map(({ count }) => count);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  };
  expectSorted();
  document
    .querySelector("main")
    .insertAdjacentHTML(
      "beforeend",
      '<a class="story">Third</a><a class="story">Fourth</a>'
    );
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expectSorted();
  expect(
    session.state.candidates.find(({ kind }) => kind === "class").count
  ).toBe(4);
});

test("count ordering does not automatically recommend a fragile position selector", () => {
  document
    .querySelector("main")
    .insertAdjacentHTML("beforeend", '<a class="story">Another link</a>');
  session.selectElement(document.querySelector("a"));
  expect(session.state.candidates[0]).toMatchObject({
    count: 1,
    fragile: true,
  });
  expect(
    session.state.candidates.find(
      ({ selector }) => selector === session.state.input
    ).fragile
  ).toBe(false);
});

test("closing the inspector cancels its draft without exiting or saving", () => {
  session.edit(".story");
  session.selectElement(document.querySelector("a"));
  session.setInput(".draft");
  session.closeInspector();
  expect(session.state).toMatchObject({
    inspectorOpen: false,
    input: "",
    editing: null,
    selected: null,
    candidates: [],
    picking: false,
  });
  expect(session.onExit).not.toHaveBeenCalled();
  expect(saveSiteRule).not.toHaveBeenCalled();
  session.add();
  expect(session.state.inspectorOpen).toBe(true);
  session.setField("selector");
  expect(session.state.inspectorOpen).toBe(false);
});

test("Escape cancels picking, then closes the inspector, then exits", () => {
  const escape = () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  session.selectElement(document.querySelector("a"));
  session.pick();
  escape();
  expect(session.state.picking).toBe(false);
  expect(session.state.inspectorOpen).toBe(true);
  escape();
  expect(session.state.inspectorOpen).toBe(false);
  expect(session.onExit).not.toHaveBeenCalled();
  escape();
  expect(session.onExit).toHaveBeenCalledTimes(1);
});

test("saving keeps the inspector open on failure and closes it on success", async () => {
  session.setField("selector");
  session.edit(".story");
  session.setInput("main > p");
  saveSiteRule.mockRejectedValueOnce(new Error("save-failed"));
  await session.commitInput();
  expect(session.state).toMatchObject({
    inspectorOpen: true,
    input: "main > p",
    editing: ".story",
  });
  await session.commitInput();
  expect(context.effective.selector).toBe("main > p");
  expect(session.state.inspectorOpen).toBe(false);
});

test("dynamic content updates counts and removed selections are released", async () => {
  session.selectElement(document.querySelector("a"));
  session.setInput(".story");
  document
    .querySelector("main")
    .insertAdjacentHTML("beforeend", '<p class="story">Third article</p>');
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expect(session.state.matches).toHaveLength(3);
  session.state.selected.remove();
  await Promise.resolve();
  jest.advanceTimersByTime(220);
  expect(session.state.selected).toBeNull();
  expect(session.state.notice).toBe("element-removed");
});

test("failed writes preserve input; undo and redo persist actual field changes", async () => {
  session.setField("selector");
  session.setInput("main > p");
  saveSiteRule.mockRejectedValueOnce(new Error("rule-conflict"));
  await session.commitInput();
  expect(session.state.input).toBe("main > p");
  expect(session.state.error).toBe("rule-conflict");
  expect(session.undoStack).toHaveLength(0);
  await session.commitInput();
  expect(session.undoStack).toHaveLength(1);
  expect(context.effective.selector).toBe(".story, main > p");
  await session.history();
  expect(saveSiteRule).toHaveBeenLastCalledWith(
    expect.objectContaining({ patch: { selector: "" } })
  );
  await session.history(true);
  expect(context.effective.selector).toBe(".story, main > p");
});

test("selecting candidates and previewing do not persist anything", () => {
  session.selectElement(document.querySelector("a"));
  session.setInput(".story");
  session.refresh();
  session.showWhole();
  expect(saveSiteRule).not.toHaveBeenCalled();
  expect(translator.setRuleEditingPreview).not.toHaveBeenCalledWith(true);
});

test("external changes are reported without discarding the draft", async () => {
  session.setInput(".my-draft");
  getRulesWithDefault.mockResolvedValue([
    { pattern: "hostname:localhost", selector: ".external" },
  ]);
  await session.checkExternalChanges();
  expect(session.state.error).toBe("rule-conflict");
  expect(session.state.input).toBe(".my-draft");
});

test("removal distinguishes overlapping coverage from an empty scope", async () => {
  session.setField("selector");
  await session.remove(".story");
  expect(session.state.notice).toBe("removed-coverage");
  translator.previewRule = () => ({ targets: [] });
  await session.save({ selector: ".story" });
  await session.remove(".story");
  expect(session.state.notice).toBe("removed");
});

test("session cleanup removes page click interception and restores runtime state", () => {
  session.pick();
  session.dispose();
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  expect(document.querySelector("a").dispatchEvent(event)).toBe(true);
  expect(translator.endRuleEditing).toHaveBeenCalledWith(
    { enabled: false },
    true
  );
});
